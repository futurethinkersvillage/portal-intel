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
}
