import { Worker, Job } from "bullmq";
import { FirecrawlClient } from "firecrawl";
import pool from "../lib/db.js";
import redis from "../lib/redis.js";
import { CATEGORIES } from "../lib/categories.js";
import { trackUsage } from "../lib/api-usage.js";

const categoryDescriptions = CATEGORIES.map(
  (c) => `${c.slug}: ${c.label} — ${c.description}`
).join("; ");

interface HTMLJobData {
  sourceId: string;
  url: string;
  categories: string[];
  region: string;
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

function getFirecrawlClient(): FirecrawlClient | null {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[Firecrawl] No FIRECRAWL_API_KEY set — HTML scraping disabled");
    return null;
  }
  return new FirecrawlClient({ apiKey });
}

function buildPrompt(categories: string[], region: string): string {
  const catNames = categories
    .map((slug) => CATEGORIES.find((c) => c.slug === slug)?.label || slug)
    .join(", ");

  return `Extract all distinct opportunities, listings, programs, events, or items from this page that are relevant to: ${catNames}. This is for a regional intelligence platform covering British Columbia and Alberta, Canada. Focus on actionable items — things people can apply to, attend, buy, or act on. For each item extract: title, a brief description, the URL/link, any date or deadline, location if mentioned, and price if mentioned. Ignore navigation links, headers, footers, and ads.`;
}

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

async function processHTMLScrape(job: Job<HTMLJobData>) {
  const { sourceId, url, categories, region } = job.data;

  const client = getFirecrawlClient();
  if (!client) {
    console.log(`[Firecrawl] Skipping ${url} — no API key`);
    return { inserted: 0, total: 0 };
  }

  try {
    const prompt = buildPrompt(categories, region);

    // Use Firecrawl scrape with JSON extraction — handles JS rendering
    const result = await client.scrape(url, {
      formats: ["json"],
      jsonOptions: {
        prompt,
        schema: itemSchema,
      },
      waitFor: 5000,
      onlyMainContent: true,
    });

    await trackUsage({
      service: "firecrawl",
      operation: "scrape",
      units: 1,
      metadata: { url, categories, region },
    });

    const items: ExtractedItem[] = (result as any)?.json?.items || [];

    if (items.length === 0) {
      console.log(`[Firecrawl] ${url}: 0 items extracted`);
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

      // Determine category — use AI-suggested or fall back to source category
      const category = item.category && categories.includes(item.category)
        ? item.category
        : categories[0] || "land";

      // Build summary from available fields
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

      // Insert with dedup by URL or title+source combo
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

    console.log(`[Firecrawl] ${url}: ${inserted} new items from ${items.length} extracted`);
    await updateSourceHealth(sourceId, items.length, false);
    return { inserted, total: items.length };
  } catch (err: any) {
    console.error(`[Firecrawl] Failed to process ${url}:`, err.message);
    await updateSourceHealth(sourceId, 0, true);
    throw err;
  }
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
    // Update yield score based on recent performance
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
    concurrency: 2,
    limiter: {
      max: 4,
      duration: 60000, // Max 4 jobs per minute to avoid Firecrawl rate limits
    },
  });

  worker.on("completed", (job) => {
    console.log(`[Firecrawl Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Firecrawl Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
