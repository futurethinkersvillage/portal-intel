import { Worker, Job } from "bullmq";
import pool from "../lib/db.js";
import redis from "../lib/redis.js";
import { CATEGORIES } from "../lib/categories.js";
import { trackUsage } from "../lib/api-usage.js";
import { scrapeUrl } from "../lib/html-scraper.js";

const categoryDescriptions = CATEGORIES.map(
  (c) => `${c.slug}: ${c.label} — ${c.description}`
).join("; ");

interface HTMLJobData {
  sourceId: string;
  url: string;
  categories: string[];
  region: string;
  scrapeMethod?: string; // 'auto' | 'static' | 'js' | 'firecrawl' | 'disabled'
}

interface ExtractedItem {
  title: string;
  description?: string;
  url?: string;
  date?: string;
  deadline?: string;
  location?: string;
  price?: string;
  category?: string;
}

function buildPrompt(categories: string[], region: string): string {
  const catNames = categories
    .map((slug) => CATEGORIES.find((c) => c.slug === slug)?.label || slug)
    .join(", ");

  return `Extract all distinct opportunities, listings, programs, events, or items from this page that are relevant to: ${catNames}. This is for a regional intelligence platform serving people actively building resilient, off-grid, and rural communities in British Columbia and Alberta, Canada.

Focus on actionable items — things people can apply to, attend, buy, or act on. For each item extract: title, a brief description, the URL/link, any date or deadline, location if mentioned, and price if mentioned.

EXCLUDE: ESG/DEI-specific incentives, nursing/clinical health job postings, aspirational content without concrete details. Focus on items relevant to builders, investors, and operators with real experience in resilience infrastructure.

Ignore navigation links, headers, footers, and ads.`;
}

async function scrapeWithFirecrawl(
  url: string,
  categories: string[],
  region: string
): Promise<ExtractedItem[]> {
  // Dynamically import Firecrawl only when needed
  let FirecrawlClient: any;
  try {
    const mod = await import("firecrawl" as any);
    FirecrawlClient = mod.FirecrawlClient || mod.default?.FirecrawlClient;
  } catch {
    console.warn("[HTML Worker] Firecrawl package not available");
    return [];
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[HTML Worker] No FIRECRAWL_API_KEY — cannot use Firecrawl");
    return [];
  }

  const client = new FirecrawlClient({ apiKey });
  const prompt = buildPrompt(categories, region);

  const itemSchema = {
    type: "object" as const,
    properties: {
      items: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            description: { type: "string" as const },
            url: { type: "string" as const },
            date: { type: "string" as const },
            deadline: { type: "string" as const },
            location: { type: "string" as const },
            price: { type: "string" as const },
            category: { type: "string" as const },
          },
          required: ["title" as const],
        },
      },
    },
  };

  const result = await client.scrape(url, {
    formats: [{ type: "json", prompt, schema: itemSchema }],
    waitFor: 5000,
    onlyMainContent: true,
  });

  await trackUsage({
    service: "firecrawl",
    operation: "scrape",
    units: 1,
    metadata: { url, categories, region },
  });

  return (result as any)?.json?.items || [];
}

async function processHTMLScrape(job: Job<HTMLJobData>) {
  const { sourceId, url, categories, region, scrapeMethod = "auto" } = job.data;

  if (scrapeMethod === "disabled") {
    console.log(`[HTML Worker] ${url}: source disabled — skipping`);
    return { inserted: 0, total: 0 };
  }

  let items: ExtractedItem[] = [];
  let usedMethod = "none";

  // Strategy: try free scraper first (auto/static), escalate to Firecrawl only if explicitly required
  if (scrapeMethod === "firecrawl") {
    // Firecrawl-only source (JS-heavy, explicitly flagged)
    console.log(`[HTML Worker] ${url}: using Firecrawl (explicit)`);
    try {
      items = await scrapeWithFirecrawl(url, categories, region);
      usedMethod = "firecrawl";
    } catch (err: any) {
      console.error(`[HTML Worker] Firecrawl failed for ${url}:`, err.message);
      await updateSourceHealth(sourceId, 0, true);
      return { inserted: 0, total: 0 };
    }
  } else {
    // Try free scraper first (static + auto)
    const prompt = buildPrompt(categories, region);
    console.log(`[HTML Worker] ${url}: trying free scraper`);

    const result = await scrapeUrl(url, categories, prompt);

    if (result.method === "free" && result.items.length > 0) {
      items = result.items;
      usedMethod = "free";
      console.log(`[HTML Worker] ${url}: free scraper got ${items.length} items`);
    } else if (result.method === "failed") {
      console.log(
        `[HTML Worker] ${url}: free scraper failed (${result.error}) — source may need scrape_method=firecrawl`
      );
      // Don't escalate automatically — we don't want to burn Firecrawl credits on unknown sources
      await updateSourceHealth(sourceId, 0, false);
      return { inserted: 0, total: 0 };
    } else {
      // Parsed OK but 0 items
      console.log(`[HTML Worker] ${url}: 0 items extracted`);
      await updateSourceHealth(sourceId, 0, false);
      return { inserted: 0, total: 0 };
    }
  }

  if (items.length === 0) {
    await updateSourceHealth(sourceId, 0, false);
    return { inserted: 0, total: 0 };
  }

  let inserted = 0;
  for (const item of items) {
    if (!item.title || item.title.length < 5) continue;

    // Resolve relative URLs
    let itemUrl = item.url || "";
    if (itemUrl && !itemUrl.startsWith("http")) {
      try {
        itemUrl = new URL(itemUrl, url).href;
      } catch {
        itemUrl = "";
      }
    }

    // Determine category
    const category =
      item.category && categories.includes(item.category)
        ? item.category
        : categories[0] || "land";

    // Build summary
    const parts = [item.description || ""];
    if (item.location) parts.push(`Location: ${item.location}`);
    if (item.price) parts.push(`Price: ${item.price}`);
    if (item.date) parts.push(`Date: ${item.date}`);
    const summary = parts.filter(Boolean).join(" · ").substring(0, 500);

    // Parse deadline/date into expires_at
    let expiresAt: string | null = null;
    const deadlineStr = item.deadline || item.date;
    if (deadlineStr) {
      try {
        const parsed = new Date(deadlineStr);
        if (!isNaN(parsed.getTime()) && parsed > new Date()) {
          expiresAt = parsed.toISOString();
        }
      } catch {}
    }

    const res = await pool.query(
      `INSERT INTO collected_items (source_id, title, summary, url, category, region, expires_at, status)
       SELECT $1, $2, $3, $4, $5, $6, $7, 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM collected_items
         WHERE (url = $4 AND url IS NOT NULL AND url != '')
            OR (title = $2 AND source_id = $1 AND collected_at > now() - interval '7 days')
       )`,
      [
        sourceId,
        item.title.substring(0, 500),
        summary || null,
        itemUrl || null,
        category,
        region,
        expiresAt,
      ]
    );

    if (res.rowCount && res.rowCount > 0) inserted++;
  }

  console.log(
    `[HTML Worker] ${url}: ${inserted} new items from ${items.length} extracted (method: ${usedMethod})`
  );
  await updateSourceHealth(sourceId, items.length, false);
  return { inserted, total: items.length };
}

async function updateSourceHealth(
  sourceId: string,
  yield_count: number,
  failed: boolean
) {
  if (failed) {
    await pool.query(
      `UPDATE sources SET
        last_scraped_at = now(),
        scrape_errors = COALESCE(scrape_errors, 0) + 1,
        consecutive_failures = COALESCE(consecutive_failures, 0) + 1,
        updated_at = now()
       WHERE id = $1`,
      [sourceId]
    );
  } else {
    const newYield = yield_count > 10 ? 0.9 : yield_count > 5 ? 0.7 : yield_count > 0 ? 0.5 : 0.2;
    await pool.query(
      `UPDATE sources SET
        last_scraped_at = now(),
        last_yield = $2,
        consecutive_failures = 0,
        yield_score = GREATEST(yield_score * 0.7 + $3 * 0.3, 0.1),
        updated_at = now()
       WHERE id = $1`,
      [sourceId, yield_count, newYield]
    );
  }
}

export function startHTMLWorker() {
  const worker = new Worker("html-scraper", processHTMLScrape, {
    connection: redis,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs/min — free scraper has no rate limit but be polite
    },
  });

  worker.on("completed", (job) => {
    console.log(`[HTML Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[HTML Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
