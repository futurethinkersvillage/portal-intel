import { FastifyInstance } from "fastify";
import { getUser } from "../lib/middleware.js";
import pool from "../lib/db.js";

export async function publicRoutes(app: FastifyInstance) {
  // Landing page — with public feed preview
  app.get("/", async (request, reply) => {
    const user = await getUser(request);

    // Fetch top 3 items per category for the public preview
    const { rows: previewItems } = await pool.query(
      `SELECT DISTINCT ON (category) id, title, COALESCE(ai_summary, summary) as summary,
              url, category, region, expires_at, ai_actionability, total_score
       FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY total_score DESC) as rn
         FROM collected_items
         WHERE status IN ('approved', 'feed', 'newsletter')
           AND (expires_at IS NULL OR expires_at > now())
       ) ranked
       WHERE rn <= 3
       ORDER BY category, total_score DESC
       LIMIT 18`
    );

    // Group by category
    const { CATEGORY_ORDER } = await import("../lib/categories.js");
    const categoryOrder = CATEGORY_ORDER;
    const preview: Record<string, typeof previewItems> = {};
    for (const item of previewItems) {
      if (!preview[item.category]) preview[item.category] = [];
      preview[item.category].push(item);
    }
    const previewGroups = categoryOrder
      .filter(s => preview[s]?.length)
      .map(s => ({ slug: s, items: preview[s] }));

    // Upcoming meetups
    const { rows: upcomingMeetups } = await pool.query(
      `SELECT m.*, COUNT(r.id)::int as rsvp_count
       FROM meetups m LEFT JOIN meetup_rsvps r ON r.meetup_id = m.id
       WHERE m.is_public = true AND m.event_date > now()
       GROUP BY m.id ORDER BY m.event_date ASC LIMIT 3`
    );

    return reply.view("index.ejs", { user, previewGroups, upcomingMeetups });
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

  // Community directory (formerly Operators)
  app.get("/community", async (request, reply) => {
    const user = await getUser(request);

    const { rows: profiles } = await pool.query(
      `SELECT p.*, u.name as user_name, u.image as user_image
       FROM profiles p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.visible = true
       ORDER BY p.category, p.created_at DESC`
    );

    return reply.view("community.ejs", { user, profiles });
  });

  // Redirect old /operators URL
  app.get("/operators", async (request, reply) => {
    return reply.redirect("/community");
  });

  // Calls placeholder
  app.get("/calls", async (request, reply) => {
    const user = await getUser(request);
    return reply.view("calls.ejs", { user });
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
