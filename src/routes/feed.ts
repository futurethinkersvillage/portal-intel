import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import pool from "../lib/db.js";

export async function feedRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request, reply) => {
    const user = (request as any).user;

    // Get all feed-eligible items — prefer AI summary over raw summary
    const { rows: rawItems } = await pool.query(
      `SELECT ci.*, COALESCE(ci.ai_summary, ci.summary) as summary,
              ci.ai_actionability,
              s.name as source_name,
              (SELECT COUNT(*) FROM saved_items si WHERE si.item_id = ci.id) as save_count
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.status IN ('approved', 'newsletter', 'feed')
         AND (ci.expires_at IS NULL OR ci.expires_at > now())
       ORDER BY ci.total_score DESC, ci.collected_at DESC
       LIMIT 200`
    );
    const items = rawItems;

    // Get visible profiles
    const { rows: profiles } = await pool.query(
      `SELECT p.*, u.name as user_name, u.image as user_image
       FROM profiles p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.visible = true
       ORDER BY p.created_at DESC
       LIMIT 50`
    );

    // Get user's saved item IDs
    const { rows: savedRows } = await pool.query(
      `SELECT item_id FROM saved_items WHERE user_id = $1`,
      [user.id]
    );
    const savedIds = new Set(savedRows.map((r: any) => r.item_id));

    // Closing soon items (expires within 7 days)
    const closingSoon = items.filter(
      (i: any) => i.expires_at && new Date(i.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    );

    return reply.view("feed.ejs", {
      user,
      items: JSON.stringify(items),
      profiles: JSON.stringify(profiles),
      closingSoon: JSON.stringify(closingSoon),
      savedIds: JSON.stringify([...savedIds]),
      categories: CATEGORIES,
      regions: REGIONS,
    });
  });

  // Save/unsave an item
  app.post("/save/:itemId", async (request, reply) => {
    const user = (request as any).user;
    const { itemId } = request.params as { itemId: string };

    // Toggle save
    const { rowCount } = await pool.query(
      `DELETE FROM saved_items WHERE user_id = $1 AND item_id = $2`,
      [user.id, itemId]
    );

    if (rowCount === 0) {
      await pool.query(
        `INSERT INTO saved_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.id, itemId]
      );
      return reply.send({ saved: true });
    }

    return reply.send({ saved: false });
  });

  // Watchlist page
  app.get("/watchlist", async (request, reply) => {
    const user = (request as any).user;

    const { rows: items } = await pool.query(
      `SELECT ci.*, s.name as source_name, si.saved_at
       FROM saved_items si
       JOIN collected_items ci ON si.item_id = ci.id
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE si.user_id = $1
       ORDER BY si.saved_at DESC`,
      [user.id]
    );

    return reply.view("watchlist.ejs", { user, items, categories: CATEGORIES });
  });
}
