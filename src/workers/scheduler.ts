import { Queue } from "bullmq";
import pool from "../lib/db.js";
import redis from "../lib/redis.js";

const rssQueue = new Queue("rss-scraper", { connection: redis });
const htmlQueue = new Queue("html-scraper", { connection: redis });

// Check which sources need to be scraped and enqueue jobs
export async function scheduleScrapeJobs() {
  const { rows: sources } = await pool.query(
    `SELECT * FROM sources WHERE active = true`
  );

  let enqueued = 0;
  for (const source of sources) {
    const jobData = {
      sourceId: source.id,
      url: source.url,
      categories: source.categories,
      region: source.region,
    };

    if (source.type === "rss") {
      await rssQueue.add(`rss-${source.id}`, jobData, {
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      enqueued++;
    } else if (source.type === "html") {
      await htmlQueue.add(`html-${source.id}`, jobData, {
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      enqueued++;
    }
    // 'api', 'manual', 'user_submitted' types don't get auto-scraped
  }

  console.log(`[Scheduler] Enqueued ${enqueued} scrape jobs from ${sources.length} active sources`);
}

// Run on a repeating interval (every 6 hours)
export function startScheduler() {
  // Run immediately on startup
  scheduleScrapeJobs().catch(console.error);

  // Then every 6 hours
  const interval = setInterval(() => {
    scheduleScrapeJobs().catch(console.error);
  }, 6 * 60 * 60 * 1000);

  return interval;
}

// Manual trigger for admin use
export { rssQueue, htmlQueue };
