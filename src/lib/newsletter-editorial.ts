import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./categories.js";

const categoryLabels: Record<string, string> = {};
CATEGORIES.forEach((c) => { categoryLabels[c.slug] = c.label; });

interface EditorialItem {
  title: string;
  summary: string | null;
  category: string;
  region: string;
  expires_at: string | null;
}

export async function generateEditorialIntro(items: EditorialItem[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const itemList = items
    .map((item, i) => {
      const cat = categoryLabels[item.category] || item.category;
      return `${i + 1}. [${cat}] ${item.title} — ${item.summary || "no description"} (${item.region.toUpperCase()})`;
    })
    .join("\n");

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You write the editorial intro for a regional intelligence newsletter covering British Columbia and Alberta, Canada. The audience is rural entrepreneurs, landowners, and community builders.

Write a 2-3 sentence editorial intro paragraph for this week's newsletter based on the items below. Highlight the most notable theme or opportunity. Be conversational and direct — no fluff, no "this week we bring you" cliches. Mention specific items by name if relevant.

Items:
${itemList}

Write ONLY the paragraph, no heading or greeting.`,
        },
      ],
    });

    const text = (resp.content[0] as any).text?.trim();
    return text || null;
  } catch (err: any) {
    console.error("[Editorial] Failed to generate intro:", err.message);
    return null;
  }
}
