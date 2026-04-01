import "dotenv/config";
import pool from "./db.js";

const coreSources = [
  {
    name: "BC Gov Grants Portal",
    url: "https://www2.gov.bc.ca/gov/content/employment-business/economic-development/bc-ideas-exchange/funding-opportunities",
    type: "html",
    categories: ["grants"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Alberta Innovates Programs",
    url: "https://albertainnovates.ca/programs/",
    type: "html",
    categories: ["grants"],
    region: "ab",
    trust_level: "core",
  },
  {
    name: "WorkBC Job Board",
    url: "https://www.workbc.ca/find-jobs/jobs.aspx",
    type: "html",
    categories: ["jobs"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Kamloops This Week",
    url: "https://www.kamloopsthisweek.com/rss",
    type: "rss",
    categories: ["events", "operators"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Clearwater Times",
    url: "https://www.clearwatertimes.com/rss",
    type: "rss",
    categories: ["events", "land"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "BC Hydro Programs",
    url: "https://www.bchydro.com/powersmart.html",
    type: "html",
    categories: ["infrastructure", "grants"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "FortisBC Rebates",
    url: "https://www.fortisbc.com/rebates",
    type: "html",
    categories: ["infrastructure", "grants"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Eventbrite BC",
    url: "https://www.eventbrite.ca/d/canada--british-columbia/events/",
    type: "html",
    categories: ["events"],
    region: "bc",
    trust_level: "candidate",
  },
];

async function seed() {
  for (const source of coreSources) {
    await pool.query(
      `INSERT INTO sources (name, url, type, categories, region, trust_level)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [source.name, source.url, source.type, source.categories, source.region, source.trust_level]
    );
    console.log(`  seeded: ${source.name}`);
  }

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
