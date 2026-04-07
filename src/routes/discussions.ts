import { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/middleware.js";
import { CATEGORIES } from "../lib/categories.js";
import pool from "../lib/db.js";

export async function discussionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAuth);

  // List discussions
  app.get("/", async (request, reply) => {
    const user = (request as any).user;
    const { rows: discussions } = await pool.query(
      `SELECT d.*, u.name as author_name, u.image as author_image,
              (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'discussion' AND c.target_id = d.id AND c.status != 'hidden') as comment_count
       FROM discussions d
       LEFT JOIN "user" u ON d.author_id = u.id
       WHERE d.status = 'open'
       ORDER BY d.pinned DESC, d.created_at DESC
       LIMIT 100`
    );
    return reply.view("discussions.ejs", { user, discussions });
  });

  // New discussion form
  app.get("/new", async (request, reply) => {
    const user = (request as any).user;
    return reply.view("discussion-new.ejs", { user });
  });

  // Create discussion
  app.post("/", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = (request as any).user;
    const { title, body, category } = request.body as { title: string; body?: string; category?: string };

    if (!title || !title.trim()) return reply.code(400).send({ error: "Title required" });

    const validCategories: string[] = CATEGORIES.map(c => c.slug);
    const cat = category && validCategories.includes(category) ? category : null;

    const { rows } = await pool.query(
      `INSERT INTO discussions (title, body, author_id, category)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [title.trim().substring(0, 300), body?.trim().substring(0, 5000) || null, user.id, cat]
    );

    return reply.redirect(`/discussions/${rows[0].id}`);
  });

  // View discussion + comments
  app.get("/:id", async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return reply.code(404).send("Not found");
    }

    const { rows: discussionRows } = await pool.query(
      `SELECT d.*, u.name as author_name, u.image as author_image
       FROM discussions d
       LEFT JOIN "user" u ON d.author_id = u.id
       WHERE d.id = $1`,
      [id]
    );

    if (!discussionRows[0] || discussionRows[0].status === 'hidden') {
      return reply.code(404).send("Not found");
    }

    const { rows: comments } = await pool.query(
      `SELECT c.id, c.target_type, c.target_id, c.parent_id, c.author_id, c.body,
              c.status, c.created_at,
              u.name as author_name, u.image as author_image
       FROM comments c
       LEFT JOIN "user" u ON c.author_id = u.id
       WHERE c.target_type = 'discussion' AND c.target_id = $1
         AND (c.status != 'hidden' OR $2 = 'admin')
       ORDER BY c.created_at ASC`,
      [id, user.role]
    );

    return reply.view("discussion-detail.ejs", {
      user,
      discussion: discussionRows[0],
      comments,
    });
  });

  // Post comment on discussion
  app.post("/:id/comments", async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const { body, parent_id } = request.body as { body: string; parent_id?: string };

    if (!body || !body.trim()) return reply.code(400).send({ error: "Comment body required" });

    // Verify discussion exists and is not locked
    const { rows: dCheck } = await pool.query(
      `SELECT locked, status FROM discussions WHERE id = $1`, [id]
    );
    if (!dCheck[0]) return reply.code(404).send({ error: "Discussion not found" });
    if (dCheck[0].locked) return reply.code(403).send({ error: "Discussion is locked" });
    if (dCheck[0].status === 'hidden') return reply.code(404).send({ error: "Discussion not found" });

    const { rows } = await pool.query(
      `INSERT INTO comments (target_type, target_id, parent_id, author_id, body)
       VALUES ('discussion', $1, $2, $3, $4)
       RETURNING id, target_type, target_id, parent_id, author_id, body, status, created_at`,
      [id, parent_id || null, user.id, body.trim().substring(0, 5000)]
    );

    return reply.send({
      ...rows[0],
      author_name: user.name,
      author_image: user.image,
    });
  });

  // Flag a discussion comment
  app.post("/:id/comments/:commentId/flag", async (request, reply) => {
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
