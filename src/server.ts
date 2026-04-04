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
import { toNodeHandler } from "better-auth/node";
import { publicRoutes } from "./routes/public.js";
import { feedRoutes } from "./routes/feed.js";
import { submitRoutes } from "./routes/submit.js";
import { profileRoutes } from "./routes/profile.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { adminRoutes } from "./routes/admin.js";
import { eventRoutes } from "./routes/events.js";
import { grantsRoutes } from "./routes/grants.js";
import { startRSSWorker } from "./workers/rss-worker.js";
import { startHTMLWorker } from "./workers/html-worker.js";
import { startScheduler } from "./workers/scheduler.js";
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
  },
});

// Better Auth catch-all handler
const authHandler = toNodeHandler(auth);
app.all("/api/auth/*", async (request, reply) => {
  // Forward to Better Auth
  const req = request.raw;
  const res = reply.raw;
  authHandler(req, res);
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
  startScheduler();
  startScoringLoop();
  startDailyAlertLoop();
  startEnrichmentLoop();
  startWeeklyDigestLoop();
  console.log("Background workers started.");
});
