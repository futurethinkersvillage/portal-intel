import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES } from "../lib/categories.js";
import { requireEnum } from "../lib/validate.js";
import pool from "../lib/db.js";

export async function preferencesRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // Preferences page (also serves as onboarding)
  app.get("/", async (request, reply) => {
    const user = (request as any).user;

    const { rows } = await pool.query(
      `SELECT preferences, alert_categories, digest_frequency FROM user_profiles WHERE user_id = $1`,
      [user.id]
    );

    return reply.view("preferences.ejs", {
      user,
      prefs: rows[0] || { preferences: [], alert_categories: [], digest_frequency: "weekly" },
      categories: CATEGORIES,
      success: false,
      isOnboarding: !user.onboarded,
    });
  });

  // Save preferences
  app.post("/", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      preferences?: string | string[];
      alert_categories?: string | string[];
      digest_frequency?: string;
    };

    const validSlugs = CATEGORIES.map((c) => c.slug);

    // Normalize to arrays and filter to known slugs
    const toArray = (v: unknown) =>
      (Array.isArray(v) ? v : v ? [v] : []).filter((s: any) => validSlugs.includes(s));

    const preferences = toArray(body.preferences);
    const alertCategories = toArray(body.alert_categories);
    const digestFrequency = ["weekly", "daily"].includes(body.digest_frequency || "")
      ? body.digest_frequency!
      : "weekly";

    await pool.query(
      `UPDATE user_profiles SET
        preferences = $1,
        alert_categories = $2,
        digest_frequency = $3,
        onboarded = true,
        updated_at = now()
       WHERE user_id = $4`,
      [preferences, alertCategories, digestFrequency, user.id]
    );

    // If this was onboarding, redirect to feed
    if (!user.onboarded) {
      return reply.redirect("/feed");
    }

    const prefs = { preferences, alert_categories: alertCategories, digest_frequency: body.digest_frequency || "weekly" };
    return reply.view("preferences.ejs", {
      user: { ...user, onboarded: true },
      prefs,
      categories: CATEGORIES,
      success: true,
      isOnboarding: false,
    });
  });
}
