import { FastifyInstance } from "fastify";
import { getUser } from "../lib/middleware.js";
import pool from "../lib/db.js";

export async function publicRoutes(app: FastifyInstance) {
  // Landing page
  app.get("/", async (request, reply) => {
    const user = await getUser(request);
    return reply.view("index.ejs", { user });
  });

  // One-click unsubscribe (works without login)
  app.get("/unsubscribe/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const { rowCount } = await pool.query(
      `UPDATE user_profiles SET status = 'unsubscribed', updated_at = now()
       WHERE unsubscribe_token = $1 AND status = 'active'`,
      [token]
    );

    return reply.view("unsubscribe.ejs", { success: (rowCount ?? 0) > 0 });
  });

  // Operator profiles directory (public)
  app.get("/operators", async (request, reply) => {
    const user = await getUser(request);

    const { rows: profiles } = await pool.query(
      `SELECT p.*, u.name as user_name, u.image as user_image
       FROM profiles p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.visible = true
       ORDER BY p.category, p.created_at DESC`
    );

    return reply.view("operators.ejs", { user, profiles });
  });

  // Newsletter archive (requires auth)
  app.get("/archive", async (request, reply) => {
    const user = await getUser(request);
    if (!user) return reply.redirect("/");

    const { rows: newsletters } = await pool.query(
      `SELECT id, issue_number, subject, sent_at FROM newsletters
       WHERE sent_at IS NOT NULL ORDER BY issue_number DESC`
    );

    return reply.view("archive.ejs", { user, newsletters });
  });

  // View individual newsletter issue
  app.get("/archive/:issueNumber", async (request, reply) => {
    const user = await getUser(request);
    if (!user) return reply.redirect("/");

    const { issueNumber } = request.params as { issueNumber: string };
    const { rows } = await pool.query(
      `SELECT * FROM newsletters WHERE issue_number = $1`,
      [parseInt(issueNumber, 10)]
    );

    if (!rows[0]) return reply.code(404).send("Not found");

    // Serve the stored HTML directly as an email-style page
    const nl = rows[0];
    return reply.view("newsletter-view.ejs", { user, nl });
  });
}
