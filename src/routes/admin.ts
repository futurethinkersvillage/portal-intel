import { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import { renderNewsletter } from "../lib/newsletter-renderer.js";
import { aiSourceSearch } from "../lib/source-search.js";
import pool from "../lib/db.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAdmin);

  // Admin dashboard
  app.get("/", async (request, reply) => {
    const user = (request as any).user;

    const [itemCount, subCount, pendingSubs, sourceCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM collected_items WHERE status != 'archived'`),
      pool.query(`SELECT COUNT(*) as count FROM user_profiles WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) as count FROM sources WHERE active = true`),
    ]);

    return reply.view("admin/dashboard.ejs", {
      user,
      stats: {
        items: itemCount.rows[0].count,
        subscribers: subCount.rows[0].count,
        pendingSubmissions: pendingSubs.rows[0].count,
        sources: sourceCount.rows[0].count,
      },
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

    // Render the newsletter HTML
    const emailHtml = renderNewsletter(
      {
        issueNumber,
        subject: body.subject,
        engagementQuestion: body.engagement_question || "",
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

    // TODO: Render HTML and send via Resend (will be built in newsletter renderer step)

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

  app.post("/source-search", async (request, reply) => {
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
}
