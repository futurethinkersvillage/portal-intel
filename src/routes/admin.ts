import { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import { renderNewsletter } from "../lib/newsletter-renderer.js";
import { aiSourceSearch } from "../lib/source-search.js";
import { generateEditorialIntro } from "../lib/newsletter-editorial.js";
import { getUsageSummary } from "../lib/api-usage.js";
import { sendBulkEmails } from "../lib/email.js";
import pool from "../lib/db.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAdmin);

  // Admin dashboard
  app.get("/", async (request, reply) => {
    const user = (request as any).user;

    const [itemCount, subCount, pendingSubs, sourceCount, usage] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM collected_items WHERE status != 'archived'`),
      pool.query(`SELECT COUNT(*) as count FROM user_profiles WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) as count FROM sources WHERE active = true`),
      getUsageSummary(),
    ]);

    return reply.view("admin/dashboard.ejs", {
      user,
      stats: {
        items: itemCount.rows[0].count,
        subscribers: subCount.rows[0].count,
        pendingSubmissions: pendingSubs.rows[0].count,
        sources: sourceCount.rows[0].count,
      },
      usage,
    });
  });

  // Source management
  app.get("/sources", async (request, reply) => {
    const user = (request as any).user;
    const { rows: sources } = await pool.query(
      `SELECT * FROM sources ORDER BY trust_level, name`
    );
    return reply.view("admin/sources.ejs", { user, sources, categories: CATEGORIES, regions: REGIONS });
  });

  app.post("/sources", async (request, reply) => {
    const body = request.body as any;
    const categories = Array.isArray(body.categories) ? body.categories : body.categories ? [body.categories] : [];

    await pool.query(
      `INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [body.name, body.url, body.type, categories, body.region, body.trust_level || "candidate", body.scrape_frequency || "0 6 * * *", body.notes || null]
    );

    return reply.redirect("/admin/sources");
  });

  app.post("/sources/:id/toggle", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(`UPDATE sources SET active = NOT active, updated_at = now() WHERE id = $1`, [id]);
    return reply.redirect("/admin/sources");
  });

  app.post("/sources/:id/edit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const categories = Array.isArray(body.categories) ? body.categories : body.categories ? [body.categories] : [];
    await pool.query(
      `UPDATE sources SET name=$1, url=$2, type=$3, categories=$4, region=$5, trust_level=$6, scrape_frequency=$7, notes=$8, updated_at=now()
       WHERE id=$9`,
      [body.name, body.url, body.type, categories, body.region, body.trust_level, body.scrape_frequency || "0 6 * * *", body.notes || null, id]
    );
    return reply.redirect("/admin/sources");
  });

  app.post("/sources/:id/delete", async (request, reply) => {
    const { id } = request.params as { id: string };
    // Soft-delete by deactivating and marking deleted, or hard-delete if no items reference it
    const { rows } = await pool.query(`SELECT COUNT(*) as count FROM collected_items WHERE source_id = $1`, [id]);
    if (parseInt(rows[0].count) > 0) {
      // Has items — just disable and mark inactive
      await pool.query(`UPDATE sources SET active = false, updated_at = now() WHERE id = $1`, [id]);
    } else {
      await pool.query(`DELETE FROM sources WHERE id = $1`, [id]);
    }
    return reply.redirect("/admin/sources");
  });

  // Submission moderation
  app.get("/submissions", async (request, reply) => {
    const user = (request as any).user;
    const { rows: submissions } = await pool.query(
      `SELECT s.*, u.name as user_name, u.email as user_email
       FROM submissions s
       JOIN "user" u ON s.user_id = u.id
       ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.created_at DESC
       LIMIT 100`
    );
    return reply.view("admin/submissions.ejs", { user, submissions });
  });

  app.post("/submissions/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };

    // Get submission
    const { rows } = await pool.query(`SELECT * FROM submissions WHERE id = $1`, [id]);
    if (rows.length === 0) return reply.redirect("/admin/submissions");
    const sub = rows[0];

    // Mark approved
    await pool.query(`UPDATE submissions SET status = 'approved' WHERE id = $1`, [id]);

    // Create collected_item from submission
    await pool.query(
      `INSERT INTO collected_items (title, summary, url, category, region, expires_at, status, submitted_by, actionability_score, recency_score, uniqueness_score, total_score)
       VALUES ($1, $2, $3, $4, $5, $6, 'feed', $7, 0.7, 0.8, 0.9, 0.75)`,
      [sub.title, sub.description, sub.url, sub.category, sub.region, sub.expires_at, sub.user_id]
    );

    // If it's a source submission, add to sources table
    if (sub.type === "source" && sub.url) {
      await pool.query(
        `INSERT INTO sources (name, url, type, categories, region, trust_level, submitted_by, approved_at)
         VALUES ($1, $2, 'user_submitted', $3, $4, 'candidate', $5, now())`,
        [sub.title, sub.url, [sub.category], sub.region, sub.user_id]
      );
    }

    return reply.redirect("/admin/submissions");
  });

  app.post("/submissions/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { moderator_notes?: string };
    await pool.query(
      `UPDATE submissions SET status = 'rejected', moderator_notes = $1 WHERE id = $2`,
      [body.moderator_notes || null, id]
    );
    return reply.redirect("/admin/submissions");
  });

  // Newsletter builder
  app.get("/newsletter", async (request, reply) => {
    const user = (request as any).user;

    // Get top-scoring items eligible for newsletter
    const { rows: items } = await pool.query(
      `SELECT ci.*, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.status IN ('approved', 'feed')
         AND (ci.expires_at IS NULL OR ci.expires_at > now())
       ORDER BY ci.total_score DESC
       LIMIT 30`
    );

    // Get latest newsletter for issue numbering
    const { rows: latest } = await pool.query(
      `SELECT issue_number FROM newsletters ORDER BY issue_number DESC LIMIT 1`
    );
    const nextIssue = (latest[0]?.issue_number || 0) + 1;

    return reply.view("admin/newsletter.ejs", {
      user,
      items,
      nextIssue,
      categories: CATEGORIES,
    });
  });

  // Newsletter preview
  app.post("/newsletter/preview", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      subject: string;
      engagement_question: string;
      item_ids: string | string[];
    };

    const itemIds = Array.isArray(body.item_ids) ? body.item_ids : body.item_ids ? [body.item_ids] : [];

    // Get latest issue number
    const { rows: latest } = await pool.query(
      `SELECT issue_number FROM newsletters ORDER BY issue_number DESC LIMIT 1`
    );
    const issueNumber = (latest[0]?.issue_number || 0) + 1;

    // Fetch selected items
    const { rows: items } = await pool.query(
      `SELECT ci.*, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.id = ANY($1)
       ORDER BY ci.total_score DESC`,
      [itemIds]
    );

    const baseUrl = process.env.BASE_URL || "https://portalplaceintel.designspore.co";

    // Generate AI editorial intro
    const editorialIntro = await generateEditorialIntro(items);

    // Render the newsletter HTML
    const emailHtml = renderNewsletter(
      {
        issueNumber,
        subject: body.subject,
        engagementQuestion: body.engagement_question || "",
        editorialIntro: editorialIntro || undefined,
        items,
        baseUrl,
      },
      "preview-token"
    );

    // Count unique categories
    const categories = new Set(items.map((i: any) => i.category));

    return reply.view("admin/newsletter-preview.ejs", {
      user,
      emailHtml,
      subject: body.subject,
      engagementQuestion: body.engagement_question || "",
      issueNumber,
      itemIds,
      itemCount: items.length,
      categoryCount: categories.size,
    });
  });

  app.post("/newsletter/send", async (request, reply) => {
    const body = request.body as {
      subject: string;
      engagement_question: string;
      item_ids: string | string[];
    };

    const itemIds = Array.isArray(body.item_ids) ? body.item_ids : [body.item_ids];

    // Get latest issue number
    const { rows: latest } = await pool.query(
      `SELECT issue_number FROM newsletters ORDER BY issue_number DESC LIMIT 1`
    );
    const issueNumber = (latest[0]?.issue_number || 0) + 1;

    // Create newsletter record
    await pool.query(
      `INSERT INTO newsletters (issue_number, subject, engagement_question, item_ids)
       VALUES ($1, $2, $3, $4)`,
      [issueNumber, body.subject, body.engagement_question, itemIds]
    );

    // Mark items as included in newsletter
    await pool.query(
      `UPDATE collected_items SET status = 'newsletter', published_at = now()
       WHERE id = ANY($1)`,
      [itemIds]
    );

    // Fetch full item data for rendering
    const { rows: items } = await pool.query(
      `SELECT id, title, COALESCE(ai_summary, summary) as summary, url, category, region, expires_at, submitted_by
       FROM collected_items WHERE id = ANY($1)`,
      [itemIds]
    );

    // Generate editorial intro
    let editorialIntro: string | undefined;
    try {
      editorialIntro = await generateEditorialIntro(items) ?? undefined;
    } catch {
      // Non-fatal — send without intro
    }

    const baseUrl = process.env.BASE_URL || "https://portal.place";

    // Get all active subscribers
    const { rows: subscribers } = await pool.query(
      `SELECT up.unsubscribe_token, u.email
       FROM user_profiles up
       JOIN "user" u ON u.id = up.user_id
       WHERE up.status = 'active' AND u.email IS NOT NULL`
    );

    // Render and send
    const htmlFn = (unsubscribeToken: string) =>
      renderNewsletter(
        { issueNumber, subject: body.subject, engagementQuestion: body.engagement_question, editorialIntro, items, baseUrl },
        unsubscribeToken
      );

    await sendBulkEmails(subscribers, body.subject, htmlFn);

    // Update newsletter record with html_body and sent_at (use first subscriber's token as sample)
    const sampleHtml = htmlFn("SAMPLE");
    await pool.query(
      `UPDATE newsletters SET html_body = $1, sent_at = now() WHERE issue_number = $2`,
      [sampleHtml, issueNumber]
    );

    return reply.redirect("/admin/newsletter");
  });

  // Items management
  app.get("/items", async (request, reply) => {
    const user = (request as any).user;
    const { rows: items } = await pool.query(
      `SELECT ci.*, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       ORDER BY ci.collected_at DESC
       LIMIT 100`
    );
    return reply.view("admin/items.ejs", { user, items, categories: CATEGORIES });
  });

  // AI Source Search
  app.get("/source-search", async (request, reply) => {
    const user = (request as any).user;
    return reply.view("admin/source-search.ejs", { user });
  });

  // Source search hits paid APIs — 20 searches per hour
  app.post("/source-search", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = (request as any).user;
    const { prompt } = request.body as { prompt: string };

    try {
      const results = await aiSourceSearch(prompt);
      return reply.view("admin/source-search.ejs", { user, results, prompt });
    } catch (err: any) {
      return reply.view("admin/source-search.ejs", {
        user,
        error: err.message || "Search failed",
        prompt,
      });
    }
  });

  app.post("/items/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    await pool.query(
      `UPDATE collected_items SET status = $1 WHERE id = $2`,
      [status, id]
    );
    return reply.redirect("/admin/items");
  });

  // Meetup management
  app.get("/events", async (request, reply) => {
    const user = (request as any).user;
    const { rows: meetups } = await pool.query(
      `SELECT m.*, COUNT(r.id)::int as rsvp_count
       FROM meetups m LEFT JOIN meetup_rsvps r ON r.meetup_id = m.id
       GROUP BY m.id ORDER BY m.event_date DESC`
    );
    return reply.view("admin/events.ejs", { user, meetups });
  });

  app.post("/events", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as any;

    const slug = (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")).substring(0, 80);
    await pool.query(
      `INSERT INTO meetups (slug, title, description, location, address, event_date, capacity, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [slug, body.title, body.description || null, body.location, body.address || null,
       body.event_date, body.capacity ? parseInt(body.capacity) : null,
       body.is_public !== "false", user.id]
    );
    return reply.redirect("/admin/events");
  });

  app.post("/events/:id/delete", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(`DELETE FROM meetups WHERE id = $1`, [id]);
    return reply.redirect("/admin/events");
  });

  app.get("/events/:id/rsvps", async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const { rows: meetup } = await pool.query(`SELECT * FROM meetups WHERE id = $1`, [id]);
    const { rows: rsvps } = await pool.query(
      `SELECT * FROM meetup_rsvps WHERE meetup_id = $1 ORDER BY created_at ASC`, [id]
    );
    return reply.view("admin/event-rsvps.ejs", { user, meetup: meetup[0], rsvps });
  });
}
