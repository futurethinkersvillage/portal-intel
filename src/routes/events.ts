import { FastifyInstance } from "fastify";
import { getUser } from "../lib/middleware.js";
import { requireString, optionalString, requireUrl } from "../lib/validate.js";
import pool from "../lib/db.js";

export async function eventRoutes(app: FastifyInstance) {
  // Public events listing
  app.get("/", async (request, reply) => {
    const user = await getUser(request);

    const { rows: meetups } = await pool.query(
      `SELECT m.*, COUNT(r.id)::int as rsvp_count
       FROM meetups m
       LEFT JOIN meetup_rsvps r ON r.meetup_id = m.id
       WHERE m.is_public = true AND m.event_date > now() - interval '1 day'
       GROUP BY m.id
       ORDER BY m.event_date ASC`
    );

    return reply.view("events.ejs", { user, meetups });
  });

  // Individual event page
  app.get("/:slug", async (request, reply) => {
    const user = await getUser(request);
    const { slug } = request.params as { slug: string };

    const { rows } = await pool.query(
      `SELECT m.*, COUNT(r.id)::int as rsvp_count
       FROM meetups m
       LEFT JOIN meetup_rsvps r ON r.meetup_id = m.id
       WHERE m.slug = $1
       GROUP BY m.id`,
      [slug]
    );

    if (!rows[0]) return reply.code(404).redirect("/events");
    const meetup = rows[0];

    // Check if user already RSVP'd
    let alreadyRsvp = false;
    if (user) {
      const { rows: rsvpRows } = await pool.query(
        `SELECT 1 FROM meetup_rsvps mr
         JOIN "user" u ON u.email = mr.email
         WHERE mr.meetup_id = $1 AND u.id = $2`,
        [meetup.id, user.id]
      );
      alreadyRsvp = rsvpRows.length > 0;
    }

    return reply.view("event-detail.ejs", { user, meetup, alreadyRsvp, success: false, error: null });
  });

  // RSVP — accepts email + name (no login required)
  app.post("/:slug/rsvp", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = await getUser(request);
    const { slug } = request.params as { slug: string };
    const body = request.body as { email: string; name: string; note?: string };

    const { rows } = await pool.query(`SELECT * FROM meetups WHERE slug = $1`, [slug]);
    if (!rows[0]) return reply.redirect("/events");
    const meetup = rows[0];

    // Check capacity
    if (meetup.capacity) {
      const { rows: count } = await pool.query(
        `SELECT COUNT(*) as n FROM meetup_rsvps WHERE meetup_id = $1`,
        [meetup.id]
      );
      if (parseInt(count[0].n) >= meetup.capacity) {
        return reply.view("event-detail.ejs", {
          user, meetup, alreadyRsvp: false, success: false,
          error: "Sorry — this event is at capacity.",
        });
      }
    }

    try {
      const email = requireString(body.email, "Email", 200);
      const name = requireString(body.name, "Name", 200);
      const note = optionalString(body.note, 500);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Please enter a valid email address.");
      }

      await pool.query(
        `INSERT INTO meetup_rsvps (meetup_id, email, name, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (meetup_id, email) DO NOTHING`,
        [meetup.id, email.toLowerCase(), name, note]
      );

      return reply.view("event-detail.ejs", { user, meetup, alreadyRsvp: true, success: true, error: null });
    } catch (err: any) {
      return reply.view("event-detail.ejs", {
        user, meetup, alreadyRsvp: false, success: false,
        error: err.message || "RSVP failed.",
      });
    }
  });
}
