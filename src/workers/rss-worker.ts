import { Worker, Job } from "bullmq";
import RSSParser from "rss-parser";
import pool from "../lib/db.js";
import redis from "../lib/redis.js";

const parser = new RSSParser();

interface RSSJobData {
  sourceId: string;
  url: string;
  categories: string[];
  region: string;
}

async function processRSSFeed(job: Job<RSSJobData>) {
  const { sourceId, url, categories, region } = job.data;

  try {
    const feed = await parser.parseURL(url);

    let inserted = 0;
    for (const item of feed.items) {
      if (!item.title) continue;

      // Check for duplicate by URL
      if (item.link) {
        const { rows } = await pool.query(
          `SELECT 1 FROM collected_items WHERE url = $1`,
          [item.link]
        );
        if (rows.length > 0) continue;
      }

      // Use first matching category or default to first source category
      const category = categories[0] || "land";

      await pool.query(
        `INSERT INTO collected_items (source_id, title, summary, url, category, region, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [
          sourceId,
          item.title.substring(0, 500),
          (item.contentSnippet || item.content || "").substring(0, 500),
          item.link || null,
          category,
          region,
        ]
      );
      inserted++;
    }

    console.log(`[RSS] ${url}: ${inserted} new items from ${feed.items.length} total`);
    return { inserted, total: feed.items.length };
  } catch (err: any) {
    console.error(`[RSS] Failed to process ${url}:`, err.message);
    throw err;
  }
}

export function startRSSWorker() {
  const worker = new Worker("rss-scraper", processRSSFeed, {
    connection: redis,
    concurrency: 3,
  });

  worker.on("completed", (job) => {
    console.log(`[RSS Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[RSS Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
