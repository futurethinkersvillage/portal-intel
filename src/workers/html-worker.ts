import { Worker, Job } from "bullmq";
import { gotScraping } from "got-scraping";
import * as cheerio from "cheerio";
import pool from "../lib/db.js";
import redis from "../lib/redis.js";

interface HTMLJobData {
  sourceId: string;
  url: string;
  categories: string[];
  region: string;
  // Selectors for extracting items from the page
  selectors?: {
    itemContainer: string;     // e.g. ".listing-item"
    title: string;             // e.g. "h3 a"
    summary?: string;          // e.g. ".description"
    link?: string;             // e.g. "a" (href attribute)
  };
}

async function processHTMLScrape(job: Job<HTMLJobData>) {
  const { sourceId, url, categories, region, selectors } = job.data;

  try {
    const response = await gotScraping({ url });
    const $ = cheerio.load(response.body);

    const sel = selectors || {
      itemContainer: "article, .listing, .item, .post",
      title: "h2 a, h3 a, .title a",
      summary: "p, .summary, .excerpt, .description",
      link: "a",
    };

    let inserted = 0;
    const items = $(sel.itemContainer);

    items.each((_i, el) => {
      const $el = $(el);
      const title = $el.find(sel.title).first().text().trim();
      const summary = sel.summary ? $el.find(sel.summary).first().text().trim() : "";
      const linkEl = sel.link ? $el.find(sel.link).first() : $el.find("a").first();
      let link = linkEl.attr("href") || "";

      if (!title) return;

      // Resolve relative URLs
      if (link && !link.startsWith("http")) {
        try {
          link = new URL(link, url).href;
        } catch {
          link = "";
        }
      }

      const category = categories[0] || "land";

      // Queue insert (fire and forget within the each loop)
      pool.query(
        `INSERT INTO collected_items (source_id, title, summary, url, category, region, status)
         SELECT $1, $2, $3, $4, $5, $6, 'pending'
         WHERE NOT EXISTS (SELECT 1 FROM collected_items WHERE url = $4 AND url IS NOT NULL AND url != '')`,
        [sourceId, title.substring(0, 500), summary.substring(0, 500), link || null, category, region]
      ).then((res) => {
        if (res.rowCount && res.rowCount > 0) inserted++;
      }).catch(() => {});
    });

    // Wait a bit for inserts to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`[HTML] ${url}: ~${inserted} new items from ${items.length} found`);
    return { inserted, total: items.length };
  } catch (err: any) {
    console.error(`[HTML] Failed to process ${url}:`, err.message);
    throw err;
  }
}

export function startHTMLWorker() {
  const worker = new Worker("html-scraper", processHTMLScrape, {
    connection: redis,
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.log(`[HTML Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[HTML Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
