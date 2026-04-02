import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, REGIONS } from "./categories.js";

const categoryList = CATEGORIES.map((c) => `${c.slug}: ${c.label} — ${c.description}`).join("\n");
const regionList = REGIONS.map((r) => `${r.slug}: ${r.label}`).join(", ");

export interface SourceResult {
  name: string;
  url: string;
  type: "rss" | "html" | "api";
  categories: string[];
  region: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

export interface SearchResults {
  query: string;
  expandedPrompt: string;
  sources: SourceResult[];
  webResults?: any[];
}

async function searchBrave(query: string): Promise<any[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      {
        headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));
  } catch {
    return [];
  }
}

export async function aiSourceSearch(userPrompt: string): Promise<SearchResults> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Add it to your environment variables.");
  }

  const client = new Anthropic({ apiKey });

  // Step 1: Expand prompt into search queries
  const expandResp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are helping find data sources (RSS feeds, websites, APIs) for a regional intelligence platform covering British Columbia and Alberta, Canada.

Categories we track:
${categoryList}

Regions: ${regionList}

Given this user prompt, generate 3-5 web search queries that would help find relevant RSS feeds, government data portals, news sites, or listing sites. Focus on BC and Alberta.

User prompt: "${userPrompt}"

Respond in JSON format only:
{
  "expandedPrompt": "a clearer, expanded version of what the user is looking for",
  "searchQueries": ["query1", "query2", "query3"]
}`,
      },
    ],
  });

  let expandedPrompt = userPrompt;
  let searchQueries: string[] = [];
  try {
    const text = (expandResp.content[0] as any).text;
    const parsed = JSON.parse(text);
    expandedPrompt = parsed.expandedPrompt || userPrompt;
    searchQueries = parsed.searchQueries || [];
  } catch {
    searchQueries = [`${userPrompt} BC Alberta RSS feed data source`];
  }

  // Step 2: Run web searches
  const allWebResults: any[] = [];
  for (const query of searchQueries.slice(0, 5)) {
    const results = await searchBrave(query);
    allWebResults.push(...results);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueResults = allWebResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Step 3: Have AI analyze results and extract source recommendations
  const webContext =
    uniqueResults.length > 0
      ? `\n\nWeb search results found:\n${uniqueResults
          .slice(0, 20)
          .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description}`)
          .join("\n\n")}`
      : "\n\n(No web search results available — use your knowledge to suggest sources.)";

  const analyzeResp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are analyzing web search results to find data sources for a regional intelligence platform covering BC and Alberta, Canada.

Categories: ${categoryList}
Regions: ${regionList}

User is looking for: ${expandedPrompt}
${webContext}

Extract and recommend 3-8 sources (RSS feeds, data portals, news sites, listing pages) that would be good to scrape or follow. For each, determine:
- name: Short descriptive name
- url: The actual URL
- type: "rss" if it's an RSS/Atom feed, "api" if it's an API, "html" if it needs scraping
- categories: Array of matching category slugs from: land, grants, operators, jobs, events, infrastructure
- region: "bc", "ab", or "national"
- description: What kind of data this source provides
- confidence: "high" if you're sure it exists and is useful, "medium" if likely useful, "low" if uncertain

Respond in JSON format only:
{
  "sources": [
    {
      "name": "...",
      "url": "...",
      "type": "html",
      "categories": ["grants"],
      "region": "bc",
      "description": "...",
      "confidence": "high"
    }
  ]
}`,
      },
    ],
  });

  let sources: SourceResult[] = [];
  try {
    const text = (analyzeResp.content[0] as any).text;
    const parsed = JSON.parse(text);
    sources = parsed.sources || [];
  } catch {
    sources = [];
  }

  return {
    query: userPrompt,
    expandedPrompt,
    sources,
    webResults: uniqueResults.slice(0, 10),
  };
}
