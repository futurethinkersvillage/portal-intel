import Anthropic from "@anthropic-ai/sdk";
import pool from "../lib/db.js";
import { CATEGORIES } from "../lib/categories.js";
import { trackUsage } from "../lib/api-usage.js";
import { getDownvoteFeedbackContext } from "../lib/feedback-context.js";

const categoryList = CATEGORIES.map((c) => `${c.slug}: ${c.label}`).join(", ");

interface ItemRow {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  region: string;
  url: string | null;
  expires_at: string | null;
}

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export async function enrichItems() {
  const client = getClient();
  if (!client) {
    console.log("[Enrichment] No ANTHROPIC_API_KEY — skipping");
    return 0;
  }

  // Get unenriched pending items (batch of 10)
  const { rows: items } = await pool.query<ItemRow>(
    `SELECT id, title, summary, category, region, url, expires_at
     FROM collected_items
     WHERE enriched_at IS NULL AND status = 'pending'
     ORDER BY collected_at DESC
     LIMIT 10`
  );

  if (items.length === 0) return 0;

  // Build a batch prompt — process all items in one API call for efficiency
  const itemDescriptions = items
    .map(
      (item, i) =>
        `[${i + 1}] Title: ${item.title}\nSummary: ${item.summary || "none"}\nCategory: ${item.category}\nRegion: ${item.region}\nURL: ${item.url || "none"}\nExpires: ${item.expires_at || "unknown"}`
    )
    .join("\n\n");

  // Get admin feedback context for learning
  let feedbackContext = "";
  try {
    feedbackContext = await getDownvoteFeedbackContext();
  } catch {
    // Non-fatal
  }

  const categorySlugs = CATEGORIES.map((c) => c.slug).join(", ");

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are an intelligence analyst for a regional platform serving people who are actively building resilient, off-grid, and rural communities in British Columbia and Alberta, Canada. These are builders, investors, and operators with skin in the game — not dreamers or aspirational people.

Categories: ${categoryList}

CONTENT FILTERING RULES (strict):
- EXCLUDE: ESG/DEI-related incentives or programs
- EXCLUDE: Nursing positions, clinical health jobs, hospital/medical job postings
- EXCLUDE: Aspirational "dreamer" content with no concrete details, no experience, no track record
- EXCLUDE: Generic government press releases with no actionable content
- FOCUS ON: Concrete, actionable items for people actively investing in resilience infrastructure
- For health/wellness: include holistic wellness only, NOT clinical/nursing/medical
- If an item should be excluded based on these rules, set its score to 0.0
${feedbackContext}
Items to analyze:
${itemDescriptions}

For each item (by number), provide these fields as JSON:

1. "headline" — A COMPELLING, ACTIONABLE headline. MAX 80 characters. REQUIREMENTS:
   - LEAD with the concrete noun or action verb: "160-acre homestead near Lillooet, \\$480K", "Apply by Jun 15: \\$50K rural innovation grant", "Sunday Oct 19: Permaculture meetup in Kamloops"
   - SURFACE key facts in the headline itself: price, location, deadline, dollar amount, acreage, capacity
   - CUT vague phrases: "update on", "news about", "announcement of", "all you need to know", "let's talk about"
   - NO clickbait, no questions, no hype — just the facts that matter
   - If the item is a land listing: include acreage + price + closest town
   - If the item is a grant: include amount + deadline
   - If the item is an event: include date + location
   - If the item is a job: include role + location/remote + salary if stated
   - DO NOT just copy the original title — rewrite it to pass these rules
   - If the original already passes all rules, you may keep it minimally modified

2. "summary" — 1-2 sentences. State what it IS, what makes it relevant, and the concrete next step. Skip intros. Front-load the specifics.

3. "actionability" — Very brief next action. Examples: "Apply by Jun 15", "Register online", "View listing", "Contact seller", "Informational"

4. "score" — 0.0-1.0 actionability score. 1.0 = immediate action with clear deadline/price/contact. 0.5 = useful but no urgency. 0.1 = informational only. 0.0 = exclude per filtering rules.

5. "best_category" — One slug from: ${categorySlugs}

6. "expires" — ISO date string if deadline/expiry can be inferred, else null

7. "details" — ONLY for best_category = "land". An object with any of these fields that can be extracted from the content (omit fields that are not present):
   - price (string with currency, e.g. "$480,000")
   - acreage (string, e.g. "160 acres" or "65 hectares")
   - zoning (string, e.g. "ALR", "RR-1", "Resort Commercial")
   - water_rights (string, e.g. "Well + creek", "Municipal", "Riparian rights included")
   - access (string, e.g. "Year-round road", "4WD only", "Fly-in")
   - power (string, e.g. "BC Hydro", "Off-grid solar", "No power")
   - closest_town (string, e.g. "Lillooet", "Kamloops")
   For non-land items, set details to null.

Respond in JSON only (no markdown fences):
{
  "items": [
    {"index": 1, "headline": "...", "summary": "...", "actionability": "...", "score": 0.7, "best_category": "grants", "expires": "2026-06-15T00:00:00Z", "details": null}
  ]
}`,
        },
      ],
    });

    await trackUsage({
      service: "anthropic",
      operation: "enrichment",
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      units: items.length,
      metadata: { model: "claude-haiku-4-5-20251001", itemCount: items.length },
    });

    const text = (resp.content[0] as any).text;
    let enriched: any[] = [];
    try {
      // Strip markdown code fences if Claude wrapped the JSON
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      }
      // Find first { and last } to handle any preamble/suffix
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      const parsed = JSON.parse(cleaned);
      enriched = parsed.items || [];
    } catch (err: any) {
      console.error("[Enrichment] Failed to parse AI response:", err?.message);
      console.error("[Enrichment] Raw response (first 500 chars):", text?.substring(0, 500));
      return 0;
    }

    let updated = 0;
    for (const e of enriched) {
      const item = items[e.index - 1];
      if (!item) continue;

      // If score is 0.0, auto-archive (filtered out by content rules)
      if (typeof e.score === "number" && e.score === 0) {
        await pool.query(
          `UPDATE collected_items SET ai_score = 0, status = 'archived', enriched_at = now() WHERE id = $1`,
          [item.id]
        );
        updated++;
        continue;
      }

      // Update the item with AI enrichment
      await pool.query(
        `UPDATE collected_items SET
          ai_headline = $1,
          ai_summary = $2,
          ai_actionability = $3,
          ai_score = $4,
          category = COALESCE($5, category),
          expires_at = COALESCE($6, expires_at),
          details = COALESCE($7::jsonb, details),
          enriched_at = now()
         WHERE id = $8`,
        [
          e.headline?.substring(0, 300) || null,
          e.summary?.substring(0, 500) || null,
          e.actionability?.substring(0, 200) || null,
          typeof e.score === "number" ? e.score : null,
          e.best_category || null,
          e.expires || null,
          e.details ? JSON.stringify(e.details) : null,
          item.id,
        ]
      );
      updated++;
    }

    // Mark any items that weren't in the response as enriched (to avoid reprocessing)
    const enrichedIds = enriched.map((e: any) => items[e.index - 1]?.id).filter(Boolean);
    const missedIds = items.map((i) => i.id).filter((id) => !enrichedIds.includes(id));
    if (missedIds.length > 0) {
      await pool.query(
        `UPDATE collected_items SET enriched_at = now() WHERE id = ANY($1)`,
        [missedIds]
      );
    }

    console.log(`[Enrichment] Enriched ${updated} of ${items.length} items`);
    return updated;
  } catch (err: any) {
    console.error("[Enrichment] Error:", err.message);
    return 0;
  }
}

export function startEnrichmentLoop() {
  // Run every 5 minutes
  const interval = setInterval(async () => {
    try {
      await enrichItems();
    } catch (err) {
      console.error("[Enrichment] Loop error:", err);
    }
  }, 5 * 60 * 1000);

  // Run immediately
  enrichItems().catch(console.error);

  return interval;
}
