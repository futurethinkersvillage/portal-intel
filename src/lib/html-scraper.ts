/**
 * Free HTML scraper: fetch → cheerio → Claude Haiku extraction
 * No Firecrawl needed for static sites — 20-200x cheaper per page.
 */

import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { trackUsage } from "./api-usage.js";

export interface ScrapedItem {
  title: string;
  description?: string;
  url?: string;
  date?: string;
  deadline?: string;
  location?: string;
  price?: string;
  category?: string;
}

interface ScrapeResult {
  items: ScrapedItem[];
  method: "free" | "failed";
  error?: string;
}

/**
 * Fetch HTML and extract structured items using Claude Haiku.
 * Returns empty items on any failure rather than throwing.
 */
export async function scrapeUrl(
  url: string,
  categories: string[],
  prompt: string,
  timeoutMs = 15000
): Promise<ScrapeResult> {
  let html: string;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PortalIntelBot/1.0; +https://intel.portal.place)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-CA,en;q=0.9",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        items: [],
        method: "failed",
        error: `HTTP ${response.status} from ${url}`,
      };
    }

    html = await response.text();
  } catch (err: any) {
    return {
      items: [],
      method: "failed",
      error: `Fetch failed: ${err.message}`,
    };
  }

  // Parse with cheerio — strip boilerplate
  let mainContent: string;
  try {
    const $ = cheerio.load(html);

    // Remove noise elements
    $(
      "script, style, nav, footer, header, aside, .sidebar, .ads, .advertisement, .cookie-notice, .newsletter-signup, iframe, noscript"
    ).remove();

    // Prefer semantic content containers
    const contentEl =
      $("main").first() ||
      $("article").first() ||
      $("#content").first() ||
      $(".content").first() ||
      $("body");

    // Extract text — collapse whitespace
    mainContent = contentEl
      .text()
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .substring(0, 12000); // Cap at ~12k chars to stay within Haiku context budget
  } catch (err: any) {
    return {
      items: [],
      method: "failed",
      error: `Cheerio parse failed: ${err.message}`,
    };
  }

  if (mainContent.length < 100) {
    return {
      items: [],
      method: "failed",
      error: "Page content too short — likely JS-rendered",
    };
  }

  // Send to Claude Haiku for structured extraction
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { items: [], method: "failed", error: "No ANTHROPIC_API_KEY" };
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${prompt}

PAGE CONTENT:
${mainContent}

Return ONLY valid JSON with this shape (no markdown fences):
{"items": [{"title": "...", "description": "...", "url": "...", "date": "...", "deadline": "...", "location": "...", "price": "...", "category": "..."}]}

Rules:
- Include only distinct, actionable items (listings, grants, jobs, events). Skip nav links, disclaimers, footers.
- "category" must be one of: ${categories.join(", ")}
- Omit fields that are not present. Return {"items":[]} if nothing relevant found.`,
        },
      ],
    });

    await trackUsage({
      service: "anthropic",
      operation: "html-extract",
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      units: 1,
      metadata: { model: "claude-haiku-4-5-20251001", url },
    });

    const raw = (resp.content[0] as any).text?.trim() || "";

    // Strip markdown fences if present
    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "");
    }

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);
    const items: ScrapedItem[] = parsed.items || [];

    return { items, method: "free" };
  } catch (err: any) {
    return {
      items: [],
      method: "failed",
      error: `Claude extraction failed: ${err.message}`,
    };
  }
}
