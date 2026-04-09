import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import pool from "../lib/db.js";

export async function feedRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  app.get("/", async (request, reply) => {
    const user = (request as any).user;

    // Get all feed-eligible items — prefer AI headline/summary over raw
    const { rows: rawItems } = await pool.query(
      `SELECT ci.*,
              COALESCE(ci.ai_headline, ci.title) as title,
              COALESCE(ci.ai_summary, ci.summary) as summary,
              ci.ai_actionability,
              s.name as source_name,
              (SELECT COUNT(*) FROM saved_items si WHERE si.item_id = ci.id) as save_count
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.status IN ('approved', 'newsletter', 'feed')
         AND (ci.expires_at IS NULL OR ci.expires_at > now())
       ORDER BY CASE WHEN ci.pinned_at IS NOT NULL THEN 0 ELSE 1 END,
              ci.total_score DESC, ci.collected_at DESC
       LIMIT 500`
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

    return reply.view("watchlist.ejs", { user, items });
  });

  // Item detail page with comments
  app.get("/:itemId", async (request, reply) => {
    const user = (request as any).user;
    const { itemId } = request.params as { itemId: string };

    // Validate UUID format to avoid SQL errors on routes like /watchlist
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
      return reply.code(404).send("Not found");
    }

    const { rows: itemRows } = await pool.query(
      `SELECT ci.*, COALESCE(ci.ai_summary, ci.summary) as summary,
              s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.id = $1`,
      [itemId]
    );

    if (!itemRows[0]) return reply.code(404).send("Not found");

    // Fetch comments with author info
    const { rows: comments } = await pool.query(
      `SELECT c.id, c.target_type, c.target_id, c.parent_id, c.author_id, c.body,
              c.status, c.created_at, c.edited_at,
              u.name as author_name, u.image as author_image
       FROM comments c
       LEFT JOIN "user" u ON c.author_id = u.id
       WHERE c.target_type = 'item' AND c.target_id = $1
         AND (c.status != 'hidden' OR $2 = 'admin')
       ORDER BY c.created_at ASC`,
      [itemId, user.role]
    );

    // Check if saved
    const { rows: savedRows } = await pool.query(
      `SELECT 1 FROM saved_items WHERE user_id = $1 AND item_id = $2 LIMIT 1`,
      [user.id, itemId]
    );

    return reply.view("item-detail.ejs", {
      user,
      item: itemRows[0],
      comments,
      isSaved: savedRows.length > 0,
    });
  });

  // Post a comment on an item
  app.post("/:itemId/comments", async (request, reply) => {
    const user = (request as any).user;
    const { itemId } = request.params as { itemId: string };
    const { body, parent_id } = request.body as { body: string; parent_id?: string };

    if (!body || !body.trim()) {
      return reply.code(400).send({ error: "Comment body required" });
    }

    // Verify item exists
    const { rows: itemCheck } = await pool.query(
      `SELECT 1 FROM collected_items WHERE id = $1 LIMIT 1`,
      [itemId]
    );
    if (!itemCheck[0]) return reply.code(404).send({ error: "Item not found" });

    // Insert comment
    const { rows } = await pool.query(
      `INSERT INTO comments (target_type, target_id, parent_id, author_id, body)
       VALUES ('item', $1, $2, $3, $4)
       RETURNING id, target_type, target_id, parent_id, author_id, body, status, created_at`,
      [itemId, parent_id || null, user.id, body.trim().substring(0, 5000)]
    );

    return reply.send({
      ...rows[0],
      author_name: user.name,
      author_image: user.image,
    });
  });

  // Flag a comment
  app.post("/:itemId/comments/:commentId/flag", async (request, reply) => {
    const user = (request as any).user;
    const { commentId } = request.params as { commentId: string };

    await pool.query(
      `UPDATE comments SET status = 'flagged', flagged_by = $1
       WHERE id = $2 AND status != 'hidden'`,
      [user.id, commentId]
    );

    return reply.send({ flagged: true });
  });
}
