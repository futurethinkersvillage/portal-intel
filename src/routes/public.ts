import { FastifyInstance } from "fastify";
import { getUser } from "../lib/middleware.js";
import pool from "../lib/db.js";

export async function publicRoutes(app: FastifyInstance) {
  // Landing page — waitlist signup form (admins get redirected to /feed via inline script)
  app.get("/", async (request, reply) => {
    const user = await getUser(request);
    return reply.view("index.ejs", { user, success: false, error: null });
  });

  // Waitlist signup (email form)
  app.post("/waitlist", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = request.body as { email?: string; name?: string; website?: string };

    // Honeypot — bots fill the hidden "website" field
    if (body.website && body.website.trim().length > 0) {
      return reply.view("index.ejs", { user: null, success: true, error: null });
    }

    const email = (body.email || "").trim().toLowerCase();
    const name = (body.name || "").trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.view("index.ejs", { user: null, success: false, error: "Please enter a valid email address." });
    }

    try {
      await pool.query(
        `INSERT INTO waitlist (email, name, source, referrer)
         VALUES ($1, $2, 'email', $3)
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, waitlist.name)`,
        [email, name, (request.headers["referer"] as string) || null]
      );
      console.log(`[Waitlist] Email signup: ${email} (${name || 'no name'})`);
    } catch (err: any) {
      console.error("[Waitlist] Insert failed:", err.message);
      return reply.view("index.ejs", { user: null, success: false, error: "Something went wrong. Please try again." });
    }

    return reply.redirect("/waitlist/thanks?email=" + encodeURIComponent(email));
  });

  // Thank-you page (handles both form signups and Google OAuth callbacks)
  app.get("/waitlist/thanks", async (request, reply) => {
    const query = request.query as { email?: string };
    const user = await getUser(request);

    // If a Google user just landed here, add them to the waitlist
    let displayEmail = query.email;
    if (user && user.email) {
      displayEmail = user.email;
      try {
        await pool.query(
          `INSERT INTO waitlist (email, name, source, user_id)
           VALUES ($1, $2, 'google', $3)
           ON CONFLICT (email) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, waitlist.name),
             user_id = COALESCE(EXCLUDED.user_id, waitlist.user_id),
             source = CASE WHEN waitlist.source = 'email' THEN 'google' ELSE waitlist.source END`,
          [user.email.toLowerCase(), user.name || null, user.id]
        );
        console.log(`[Waitlist] Google signup: ${user.email}`);
      } catch (err: any) {
        console.error("[Waitlist] Google sync failed:", err.message);
      }
    }

    return reply.view("waitlist-thanks.ejs", { user, email: displayEmail });
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

  // In waitlist mode, gate the community/calls/archive pages to admins only
  const isWaitlistMode = () => process.env.WAITLIST_MODE === "true";

  app.get("/community", async (request, reply) => {
    const user = await getUser(request);
    if (isWaitlistMode() && (!user || user.role !== "admin")) {
      return reply.redirect(user ? "/waitlist/thanks" : "/");
    }
    const { rows: profiles } = await pool.query(
      `SELECT p.*, u.name as user_name, u.image as user_image
       FROM profiles p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.visible = true
       ORDER BY p.category, p.created_at DESC`
    );
    return reply.view("community.ejs", { user, profiles });
  });

  app.get("/operators", async (_request, reply) => reply.redirect("/community"));

  app.get("/calls", async (request, reply) => {
    const user = await getUser(request);
    if (isWaitlistMode() && (!user || user.role !== "admin")) {
      return reply.redirect(user ? "/waitlist/thanks" : "/");
    }

    const { rows: upcomingCalls } = await pool.query(
      `SELECT * FROM calls WHERE is_past = false AND is_public = true
       ORDER BY scheduled_at ASC LIMIT 50`
    );
    const { rows: pastCalls } = await pool.query(
      `SELECT * FROM calls WHERE is_past = true AND is_public = true
       ORDER BY scheduled_at DESC LIMIT 50`
    );

    return reply.view("calls.ejs", { user, upcomingCalls, pastCalls });
  });

  app.get("/archive", async (request, reply) => {
    const user = await getUser(request);
    if (!user) return reply.redirect("/");
    if (isWaitlistMode() && user.role !== "admin") return reply.redirect("/waitlist/thanks");

    const { rows: newsletters } = await pool.query(
      `SELECT id, issue_number, subject, sent_at FROM newsletters
       WHERE sent_at IS NOT NULL ORDER BY issue_number DESC`
    );
    return reply.view("archive.ejs", { user, newsletters });
  });

  app.get("/archive/:issueNumber", async (request, reply) => {
    const user = await getUser(request);
    if (!user) return reply.redirect("/");
    if (isWaitlistMode() && user.role !== "admin") return reply.redirect("/waitlist/thanks");

    const { issueNumber } = request.params as { issueNumber: string };
    const { rows } = await pool.query(
      `SELECT * FROM newsletters WHERE issue_number = $1`,
      [parseInt(issueNumber, 10)]
    );
    if (!rows[0]) return reply.code(404).send("Not found");
    return reply.view("newsletter-view.ejs", { user, nl: rows[0] });
  });
}
