import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import pool from "../lib/db.js";

export async function submitRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Submission form
  app.get("/", async (request, reply) => {
    const user = (request as any).user;
    return reply.view("submit.ejs", { user, categories: CATEGORIES, regions: REGIONS, success: false, error: null });
  });

  // Handle submission
  app.post("/", async (request, reply) => {
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

    if (!body.title || !body.type || !body.category) {
      return reply.view("submit.ejs", {
        user,
        categories: CATEGORIES,
        regions: REGIONS,
        success: false,
        error: "Title, type, and category are required.",
      });
    }

    await pool.query(
      `INSERT INTO submissions (user_id, type, title, description, url, category, region, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        body.type,
        body.title,
        body.description || null,
        body.url || null,
        body.category,
        body.region || "bc",
        body.expires_at || null,
      ]
    );

    return reply.view("submit.ejs", {
      user,
      categories: CATEGORIES,
      regions: REGIONS,
      success: true,
      error: null,
    });
  });
}
