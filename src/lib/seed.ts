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

  // Land & Property
  {
    name: "BC Assessment Property Info",
    url: "https://info.bcassessment.ca/",
    type: "html",
    categories: ["land"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "BC Land Auctions (Gov)",
    url: "https://www2.gov.bc.ca/gov/content/industry/crown-land-water/crown-land/crown-land-uses/residential-uses/buying-crown-land",
    type: "html",
    categories: ["land"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "FarmLink Alberta",
    url: "https://www.farmlinksolutions.ca/listings",
    type: "html",
    categories: ["land"],
    region: "ab",
    trust_level: "candidate",
  },
  {
    name: "Landquest Realty BC",
    url: "https://www.landquest.com/properties",
    type: "html",
    categories: ["land"],
    region: "bc",
    trust_level: "candidate",
  },
  {
    name: "Alberta Rural Property (Realtor.ca)",
    url: "https://www.realtor.ca/map#view=list&Sort=6-D&GeoIds=g30_dpn72xjh&GeoName=Alberta&PropertyTypeGroupID=2",
    type: "html",
    categories: ["land"],
    region: "ab",
    trust_level: "candidate",
  },

  // Jobs
  {
    name: "Alberta Job Bank",
    url: "https://www.jobbank.gc.ca/jobsearch/jobsearch?flg=E&provid=AB",
    type: "html",
    categories: ["jobs"],
    region: "ab",
    trust_level: "core",
  },
  {
    name: "BC Public Service Jobs",
    url: "https://bcpublicservice.hua.hrsmart.com/hr/ats/JobSearch/index",
    type: "html",
    categories: ["jobs"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "WWOOF Canada (Work-Stay)",
    url: "https://wwoof.ca/en/host-list?province=British+Columbia",
    type: "html",
    categories: ["jobs"],
    region: "bc",
    trust_level: "candidate",
  },

  // Events
  {
    name: "Tourism Kamloops Events",
    url: "https://www.tourismkamloops.com/events",
    type: "html",
    categories: ["events"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Travel Alberta Events",
    url: "https://www.travelalberta.com/things-to-do/events/",
    type: "html",
    categories: ["events"],
    region: "ab",
    trust_level: "core",
  },
  {
    name: "HelloBC Things To Do",
    url: "https://www.hellobc.com/things-to-do/",
    type: "html",
    categories: ["events"],
    region: "bc",
    trust_level: "candidate",
  },
  {
    name: "UBC Okanagan Events",
    url: "https://events.ok.ubc.ca/",
    type: "html",
    categories: ["events"],
    region: "bc",
    trust_level: "candidate",
  },

  // Operators & Trades
  {
    name: "BC Construction Association",
    url: "https://www.bccassn.com/news/",
    type: "html",
    categories: ["operators", "infrastructure"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Alberta Construction Association",
    url: "https://www.albertaconstruction.net/news",
    type: "html",
    categories: ["operators", "infrastructure"],
    region: "ab",
    trust_level: "core",
  },
  {
    name: "BC Makers Directory",
    url: "https://bcmakers.ca/",
    type: "html",
    categories: ["operators"],
    region: "bc",
    trust_level: "candidate",
  },

  // Infrastructure & Building
  {
    name: "CleanBC Programs",
    url: "https://www2.gov.bc.ca/gov/content/environment/climate-change/clean-bc",
    type: "html",
    categories: ["infrastructure", "grants"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Solar BC / Net Zero",
    url: "https://bcsea.org/",
    type: "html",
    categories: ["infrastructure"],
    region: "bc",
    trust_level: "candidate",
  },
  {
    name: "Alberta Energy Programs",
    url: "https://www.alberta.ca/energy-programs",
    type: "html",
    categories: ["infrastructure", "grants"],
    region: "ab",
    trust_level: "core",
  },

  // Multi-category / Regional
  {
    name: "BC Economic Development",
    url: "https://www2.gov.bc.ca/gov/content/employment-business/economic-development",
    type: "html",
    categories: ["grants", "jobs"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Community Futures BC",
    url: "https://www.communityfutures.ca/bc-cf-members",
    type: "html",
    categories: ["grants", "operators"],
    region: "bc",
    trust_level: "core",
  },
  {
    name: "Alberta Community & Social Services",
    url: "https://www.alberta.ca/community-and-social-services",
    type: "html",
    categories: ["grants"],
    region: "ab",
    trust_level: "core",
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
