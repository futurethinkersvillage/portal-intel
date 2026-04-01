import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import pool from "../lib/db.js";

export async function profileRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Edit profile page
  app.get("/edit", async (request, reply) => {
    const user = (request as any).user;

    const { rows } = await pool.query(
      `SELECT * FROM profiles WHERE user_id = $1`,
      [user.id]
    );

    return reply.view("profile-edit.ejs", {
      user,
      profile: rows[0] || null,
      categories: CATEGORIES,
      regions: REGIONS,
      success: false,
    });
  });

  // Save profile
  app.post("/edit", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      display_name: string;
      tagline?: string;
      description?: string;
      category: string;
      region: string;
      website_url?: string;
      contact_method?: string;
      visible?: string;
    };

    if (!body.display_name || !body.category) {
      return reply.view("profile-edit.ejs", {
        user,
        profile: body,
        categories: CATEGORIES,
        regions: REGIONS,
        success: false,
      });
    }

    await pool.query(
      `INSERT INTO profiles (user_id, display_name, tagline, description, category, region, website_url, contact_method, visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         tagline = EXCLUDED.tagline,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         region = EXCLUDED.region,
         website_url = EXCLUDED.website_url,
         contact_method = EXCLUDED.contact_method,
         visible = EXCLUDED.visible,
         updated_at = now()`,
      [
        user.id,
        body.display_name,
        body.tagline || null,
        body.description || null,
        body.category,
        body.region || "bc",
        body.website_url || null,
        body.contact_method || null,
        body.visible === "on",
      ]
    );

    const { rows } = await pool.query(
      `SELECT * FROM profiles WHERE user_id = $1`,
      [user.id]
    );

    return reply.view("profile-edit.ejs", {
      user,
      profile: rows[0],
      categories: CATEGORIES,
      regions: REGIONS,
      success: true,
    });
  });
}
