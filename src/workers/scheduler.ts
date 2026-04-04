import { Queue } from "bullmq";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const CronParser = require("cron-parser");
import pool from "../lib/db.js";
import redis from "../lib/redis.js";

const rssQueue = new Queue("rss-scraper", { connection: redis });
const htmlQueue = new Queue("html-scraper", { connection: redis });

// Returns true if this source is due for a scrape based on its cron schedule
function isDue(cronExpr: string, lastScrapedAt: Date | null): boolean {
  try {
    const interval = CronParser.parseExpression(cronExpr, { utc: true });
    const prev = interval.prev().toDate();
    // Due if last scrape was before the most recent scheduled slot
    if (!lastScrapedAt) return true;
    return lastScrapedAt < prev;
  } catch {
    // Unparseable cron — fall back to always running
    return true;
  }
}

// Check which sources are due and enqueue jobs
export async function scheduleScrapeJobs() {
  const { rows: sources } = await pool.query(
    `SELECT * FROM sources WHERE active = true`
  );

  let enqueued = 0;
  for (const source of sources) {
    const cron = source.scrape_frequency || "0 6 * * *";
    const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;

    if (!isDue(cron, lastScraped)) continue;

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
    // 'api', 'manual', 'user_submitted' don't get auto-scraped
  }

  if (enqueued > 0) {
    console.log(`[Scheduler] Enqueued ${enqueued} scrape jobs from ${sources.length} active sources`);
  }
}

// Poll every minute — each source uses its own cron schedule
export function startScheduler() {
  // Run immediately on startup
  scheduleScrapeJobs().catch(console.error);

  // Check every minute which sources are due
  const interval = setInterval(() => {
    scheduleScrapeJobs().catch(console.error);
  }, 60 * 1000);

  return interval;
}

export { rssQueue, htmlQueue };
