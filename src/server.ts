import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
// fastifyFormbody removed — replaced by custom content-type parser below
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import { auth } from "./lib/auth.js";
import { CATEGORIES, CATEGORY_CLIENT_DATA, CATEGORY_ORDER, REGIONS } from "./lib/categories.js";
import { toNodeHandler } from "better-auth/node";
import { publicRoutes } from "./routes/public.js";
import { feedRoutes } from "./routes/feed.js";
import { submitRoutes } from "./routes/submit.js";
import { profileRoutes } from "./routes/profile.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { adminRoutes } from "./routes/admin.js";
import { eventRoutes } from "./routes/events.js";
import { grantsRoutes } from "./routes/grants.js";
import { discussionRoutes } from "./routes/discussions.js";
import { startRSSWorker } from "./workers/rss-worker.js";
import { startHTMLWorker } from "./workers/html-worker.js";
// scheduler import removed — manual scraping only via admin button
import { startScoringLoop } from "./workers/scoring.js";
import { startDailyAlertLoop } from "./workers/daily-alerts.js";
import { startEnrichmentLoop } from "./workers/enrichment.js";
import { startWeeklyDigestLoop } from "./workers/weekly-digest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, {
  origin: process.env.BASE_URL || "http://localhost:3000",
  credentials: true,
});
await app.register(fastifyRateLimit, {
  global: false, // Apply per-route, not globally
});
await app.register(fastifyCookie);

// Better Auth needs the raw body — register a passthrough content-type parser
// that runs ONLY for /api/auth/* before fastify-formbody touches anything.
app.addContentTypeParser(
  ["application/json", "application/x-www-form-urlencoded"],
  { parseAs: "buffer" },
  (request, body, done) => {
    if (request.url?.startsWith("/api/auth/")) {
      // Skip parsing — Better Auth reads the raw body itself
      done(null, body);
    } else {
      // Default JSON parse for everything else
      try {
        const text = body.toString("utf8");
        if (request.headers["content-type"]?.includes("application/json")) {
          done(null, text ? JSON.parse(text) : {});
        } else {
          // Form-encoded fallback (manual parse since we're skipping fastify-formbody for auth)
          const params = new URLSearchParams(text);
          const obj: Record<string, any> = {};
          for (const [k, v] of params) {
            if (k in obj) {
              if (Array.isArray(obj[k])) obj[k].push(v);
              else obj[k] = [obj[k], v];
            } else {
              obj[k] = v;
            }
          }
          done(null, obj);
        }
      } catch (err: any) {
        done(err, undefined);
      }
    }
  }
);

await app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/public/",
});
await app.register(fastifyView, {
  engine: { ejs },
  root: path.join(__dirname, "../src/views"),
  layout: "layouts/main.ejs",
  defaultContext: {
    siteName: "Portal.Place Intel",
    user: null,
    title: "",
    categories: CATEGORIES,
    regions: REGIONS,
    categoryData: CATEGORY_CLIENT_DATA,
    categoryDataJSON: JSON.stringify(CATEGORY_CLIENT_DATA),
    categoryOrder: CATEGORY_ORDER,
    categoryOrderJSON: JSON.stringify(CATEGORY_ORDER),
  },
});

// Better Auth catch-all handler.
// reply.hijack() tells Fastify we'll write to the raw response ourselves;
// Better Auth's toNodeHandler reads the raw body and writes the response.
const authHandler = toNodeHandler(auth);
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    reply.hijack();
    try {
      await authHandler(request.raw, reply.raw);
    } catch (err) {
      app.log.error({ err }, "Better Auth handler error");
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.end("Auth error");
      }
    }
  },
});

// Routes
await app.register(publicRoutes);
await app.register(feedRoutes, { prefix: "/feed" });
await app.register(submitRoutes, { prefix: "/submit" });
await app.register(profileRoutes, { prefix: "/profile" });
await app.register(preferencesRoutes, { prefix: "/preferences" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(eventRoutes, { prefix: "/events" });
await app.register(grantsRoutes, { prefix: "/grants" });
await app.register(discussionRoutes, { prefix: "/discussions" });

// Start
const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Portal.Place Intel running at http://${host}:${port}`);

  // Start background workers
  startRSSWorker();
  startHTMLWorker();
  // startScheduler() — DISABLED: scrapes are manual via admin button only
  startScoringLoop();
  startDailyAlertLoop();
  startEnrichmentLoop();
  startWeeklyDigestLoop();
  console.log("Background workers started (scheduler disabled — manual scraping only).");
});
