import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import { requireString, requireEnum, optionalString, optionalDate, requireUrl } from "../lib/validate.js";
import pool from "../lib/db.js";

export async function submitRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Submission form
  app.get("/", async (request, reply) => {
    const user = (request as any).user;
    return reply.view("submit.ejs", { user, success: false, error: null });
  });

  // Handle submission — 10 per hour per user
  app.post("/", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      type: string;
      title: string;
      description?: string;
      url?: string;
      category: string;
      region: string;
      expires_at?: string;
    };

    try {
      const SUBMISSION_TYPES = ["project", "listing", "event", "source", "tip", "deal"] as const;
      const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
      const REGION_SLUGS = REGIONS.map((r) => r.slug);

      const title = requireString(body.title, "Title", 300);
      const type = requireEnum(body.type, "Type", SUBMISSION_TYPES);
      const category = requireEnum(body.category, "Category", CATEGORY_SLUGS as any);
      const region = requireEnum(body.region || "bc", "Region", REGION_SLUGS as any);
      const description = optionalString(body.description, 1000);
      const expiresAt = optionalDate(body.expires_at);
      // Only validate URL if provided
      let url: string | null = null;
      if (body.url && body.url.trim()) {
        url = requireUrl(body.url, "URL");
      }

      await pool.query(
        `INSERT INTO submissions (user_id, type, title, description, url, category, region, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, type, title, description, url, category, region, expiresAt]
      );
    } catch (err: any) {
      return reply.view("submit.ejs", {
        user, success: false,
        error: err.message || "Submission failed.",
      });
    }

    return reply.view("submit.ejs", {
      user,
      success: true,
      error: null,
    });
  });
}
