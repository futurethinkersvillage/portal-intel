import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import fastifyFormbody from "@fastify/formbody";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import { auth } from "./lib/auth.js";
import { CATEGORIES, CATEGORY_CLIENT_DATA, CATEGORY_ORDER, REGIONS } from "./lib/categories.js";
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
await app.register(fastifyFormbody);

// Better Auth catch-all handler — use the web-standards `auth.handler` API
// which takes a Fetch Request and returns a Fetch Response. This avoids the
// Node stream consumption issues that toNodeHandler has under Fastify.
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const baseUrl = process.env.BETTER_AUTH_URL || `https://${request.hostname}`;
      const url = new URL(request.url, baseUrl);

      // Build a Fetch-compatible Request from the Fastify request
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else if (value !== undefined) {
          headers.set(key, String(value));
        }
      }

      let body: BodyInit | null = null;
      if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
        body =
          typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body);
      }

      const fetchRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body,
      });

      const fetchResponse = await auth.handler(fetchRequest);

      reply.status(fetchResponse.status);
      fetchResponse.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      const responseBody = await fetchResponse.text();
      return reply.send(responseBody);
    } catch (err: any) {
      app.log.error({ err: err.message, stack: err.stack }, "Better Auth handler error");
      return reply.status(500).send({ error: "Auth error", message: err.message });
    }
  },
});

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
