import { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/middleware.js";
import { CATEGORIES, REGIONS } from "../lib/categories.js";
import { renderNewsletter } from "../lib/newsletter-renderer.js";
import { aiSourceSearch } from "../lib/source-search.js";
import { generateEditorialIntro } from "../lib/newsletter-editorial.js";
import { getUsageSummary } from "../lib/api-usage.js";
import { sendBulkEmails } from "../lib/email.js";
import { getAllSettings, setSetting } from "../lib/system-settings.js";
import pool from "../lib/db.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireAdmin);

  // Admin dashboard
  app.get("/", async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { scraped?: string; reenrich?: string; zoom_synced?: string; zoom_error?: string };

    const [itemCount, subCount, pendingSubs, sourceCount, usage, workerSettings] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM collected_items WHERE status != 'archived'`),
      pool.query(`SELECT COUNT(*) as count FROM user_profiles WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) as count FROM sources WHERE active = true`),
      getUsageSummary(),
      getAllSettings(),
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
      workerSettings,
      scrapedCount: query.scraped ? parseInt(query.scraped) : null,
      reenrichCount: query.reenrich ? parseInt(query.reenrich) : null,
      zoomSyncedCount: query.zoom_synced ? parseInt(query.zoom_synced) : null,
      zoomError: query.zoom_error || null,
    });
  });

  // Source management
  app.get("/sources", async (request, reply) => {
    const user = (request as any).user;
    const { rows: sources } = await pool.query(
      `SELECT * FROM sources ORDER BY trust_level, name`
    );
    return reply.view("admin/sources.ejs", { user, sources });
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
      `UPDATE sources SET name=$1, url=$2, type=$3, categories=$4, region=$5, trust_level=$6, scrape_frequency=$7, notes=$8, scrape_method=$9, updated_at=now()
       WHERE id=$10`,
      [body.name, body.url, body.type, categories, body.region, body.trust_level, body.scrape_frequency || "0 6 * * *", body.notes || null, body.scrape_method || "auto", id]
    );
    return reply.redirect("/admin/sources");
  });

  app.post("/sources/:id/scrape", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rows } = await pool.query(`SELECT * FROM sources WHERE id = $1`, [id]);
    if (!rows[0]) return reply.redirect("/admin/sources");
    const source = rows[0];
    const { rssQueue, htmlQueue } = await import("../workers/scheduler.js");
    if (source.scrape_method === "disabled") return reply.redirect("/admin/sources");
    const jobData = { sourceId: source.id, url: source.url, categories: source.categories, region: source.region, scrapeMethod: source.scrape_method || "auto" };
    if (source.type === "rss") await rssQueue.add(`rss-manual-${source.id}`, jobData, { removeOnComplete: 10, removeOnFail: 10 });
    else if (source.type === "html") await htmlQueue.add(`html-manual-${source.id}`, jobData, { removeOnComplete: 10, removeOnFail: 10 });
    return reply.redirect("/admin/sources");
  });

  // Toggle a worker setting on/off
  app.post("/settings/toggle/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const allowed = ["enrichment_enabled", "scraping_enabled", "alerts_enabled", "digest_enabled", "scoring_enabled"];
    if (!allowed.includes(key)) return reply.code(400).send({ error: "Unknown setting" });
    const current = await getAllSettings();
    const setting = current.find(s => s.key === key);
    const newValue = setting?.value === "true" ? "false" : "true";
    await setSetting(key, newValue);
    return reply.send({ key, value: newValue });
  });

  // Force re-enrichment of existing items (resets enriched_at so enrichment worker picks them up)
  app.post("/reenrich", async (request, reply) => {
    const body = request.body as { scope?: string };
    const scope = body.scope || "unvoted"; // 'unvoted' | 'all' | 'recent'

    let whereClause = "";
    if (scope === "unvoted") {
      // Skip items the admin has already voted on
      whereClause = "WHERE admin_vote = 0 AND status != 'archived'";
    } else if (scope === "recent") {
      whereClause = "WHERE collected_at > now() - interval '30 days' AND status != 'archived'";
    } else {
      whereClause = "WHERE status != 'archived'";
    }

    const { rowCount } = await pool.query(
      `UPDATE collected_items
       SET enriched_at = NULL, status = 'pending', ai_headline = NULL, ai_summary = NULL, ai_actionability = NULL, ai_score = NULL
       ${whereClause}`
    );
    console.log(`[Admin] Queued ${rowCount} items for re-enrichment (scope: ${scope})`);
    return reply.redirect(`/admin?reenrich=${rowCount}`);
  });

  // Sync Zoom calls
  app.post("/sync-zoom", async (request, reply) => {
    try {
      const { syncZoomCalls } = await import("../workers/zoom-sync.js");
      const result = await syncZoomCalls();
      const total = result.upcomingAdded + result.upcomingUpdated + result.pastAdded + result.pastUpdated;
      return reply.redirect(`/admin?zoom_synced=${total}`);
    } catch (err: any) {
      console.error("[Admin] Zoom sync failed:", err.message);
      return reply.redirect(`/admin?zoom_error=${encodeURIComponent(err.message)}`);
    }
  });

  // Import a Facebook event by URL — tries Firecrawl first, redirects to manual form on failure
  app.post("/events/import-fb", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as { url: string; is_past?: string };
    if (!body.url) return reply.redirect("/admin/events");

    try {
      const { scrapeFacebookEvent } = await import("../lib/facebook-events.js");
      const event = await scrapeFacebookEvent(body.url);
      if (!event || !event.title) {
        // Scrape failed — redirect to manual form with the URL prefilled
        return reply.redirect(`/admin/events?fb_url=${encodeURIComponent(body.url)}&fb_error=scrape_failed`);
      }

      const slug = (event.title || "fb-event")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .substring(0, 80) + "-" + Date.now().toString(36);

      const eventDate = event.event_date ? new Date(event.event_date) : new Date();

      await pool.query(
        `INSERT INTO meetups (slug, title, description, location, address, event_date, is_public, created_by, event_url, image_url, source)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, 'facebook')`,
        [
          slug,
          event.title.substring(0, 300),
          event.description || null,
          event.location || "TBD",
          event.address || null,
          eventDate.toISOString(),
          user.id,
          event.event_url,
          event.image_url || null,
        ]
      );
      console.log(`[Admin] Imported FB event: ${event.title}`);
      return reply.redirect("/admin/events?fb_imported=1");
    } catch (err: any) {
      console.error("[Admin] FB import failed:", err.message);
      return reply.redirect(`/admin/events?fb_url=${encodeURIComponent(body.url)}&fb_error=${encodeURIComponent(err.message)}`);
    }
  });

  // Manual event creation (also accepts event_url for Facebook fallback)
  app.post("/events/create-external", async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      title: string;
      description?: string;
      location: string;
      address?: string;
      event_date: string;
      event_url?: string;
      image_url?: string;
      source?: string;
    };

    const slug = (body.title || "event")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .substring(0, 80) + "-" + Date.now().toString(36);

    await pool.query(
      `INSERT INTO meetups (slug, title, description, location, address, event_date, is_public, created_by, event_url, image_url, source)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10)`,
      [
        slug,
        body.title.substring(0, 300),
        body.description || null,
        body.location || "TBD",
        body.address || null,
        body.event_date,
        user.id,
        body.event_url || null,
        body.image_url || null,
        body.source || "manual",
      ]
    );
    return reply.redirect("/admin/events?fb_imported=1");
  });

  // Manual call creation (for seeding past Zoom calls that aren't available via API, etc.)
  app.post("/calls/create", async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      scheduled_at: string;
      duration_minutes?: string;
      join_url?: string;
      recording_url?: string;
      categories?: string;
      is_past?: string;
    };

    const categories = body.categories ? body.categories.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const isPast = body.is_past === "true" || new Date(body.scheduled_at) < new Date();

    await pool.query(
      `INSERT INTO calls (title, description, scheduled_at, duration_minutes, join_url, recording_url, categories, is_past, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')`,
      [
        body.title.substring(0, 300),
        body.description || null,
        body.scheduled_at,
        body.duration_minutes ? parseInt(body.duration_minutes) : null,
        body.join_url || null,
        body.recording_url || null,
        categories,
        isPast,
      ]
    );
    return reply.redirect("/admin/events?call_created=1");
  });

  // Scrape all active sources at once
  app.post("/scrape-all", async (request, reply) => {
    const { rows: sources } = await pool.query(
      `SELECT * FROM sources WHERE active = true AND type IN ('rss', 'html')`
    );
    const { rssQueue, htmlQueue } = await import("../workers/scheduler.js");

    let rss = 0, html = 0;
    for (const source of sources) {
      if (source.scrape_method === "disabled") continue;
      const jobData = {
        sourceId: source.id,
        url: source.url,
        categories: source.categories,
        region: source.region,
        scrapeMethod: source.scrape_method || "auto",
      };
      if (source.type === "rss") {
        await rssQueue.add(`rss-manual-${source.id}-${Date.now()}`, jobData, {
          removeOnComplete: 10,
          removeOnFail: 10,
        });
        rss++;
      } else if (source.type === "html") {
        await htmlQueue.add(`html-manual-${source.id}-${Date.now()}`, jobData, {
          removeOnComplete: 10,
          removeOnFail: 10,
        });
        html++;
      }
    }

    console.log(`[Manual Scrape] Queued ${rss} RSS + ${html} HTML jobs from ${sources.length} sources`);
    return reply.redirect("/admin?scraped=" + (rss + html));
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
      `SELECT ci.*, COALESCE(ci.ai_summary, ci.summary) as summary,
              s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       ORDER BY CASE ci.admin_vote WHEN 0 THEN 0 WHEN 1 THEN 1 ELSE 2 END, ci.collected_at DESC
       LIMIT 200`
    );
    return reply.view("admin/items.ejs", { user, items });
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

  // Admin feedback: vote on an item (+1 upvote, -1 downvote)
  app.post("/items/:id/vote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { vote, comment } = request.body as { vote: string; comment?: string };
    const voteVal = parseInt(vote);
    // Detect AJAX calls from feed cards (fetch without Accept: text/html)
    const isAjax = (request.headers["accept"] || "").indexOf("text/html") === -1;
    const respond = (status: number, body?: any) => {
      if (isAjax) return reply.code(status).send(body || { ok: status < 400 });
      return reply.redirect("/admin/items");
    };

    if (voteVal !== 1 && voteVal !== -1 && voteVal !== 0) return respond(400);

    // Require comment for non-zero votes
    if (voteVal !== 0 && (!comment || !comment.trim())) {
      return respond(400, { error: "Comment required" });
    }

    // Set the vote and comment
    await pool.query(
      `UPDATE collected_items SET admin_vote = $1, admin_comment = $2 WHERE id = $3`,
      [voteVal, comment?.trim() || null, id]
    );

    // Downvote = archive immediately
    if (voteVal === -1) {
      await pool.query(
        `UPDATE collected_items SET status = 'archived' WHERE id = $1 AND status NOT IN ('archived', 'expired')`,
        [id]
      );
    }
    // Upvote = promote to approved if pending/feed
    if (voteVal === 1) {
      await pool.query(
        `UPDATE collected_items SET status = 'approved' WHERE id = $1 AND status IN ('pending', 'feed')`,
        [id]
      );
    }

    // Propagate feedback to source yield_score
    const { rows } = await pool.query(
      `SELECT source_id FROM collected_items WHERE id = $1 AND source_id IS NOT NULL`, [id]
    );
    if (rows[0]?.source_id) {
      // Recalculate source yield from admin votes on its items
      const { rows: stats } = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE admin_vote = 1) as upvotes,
           COUNT(*) FILTER (WHERE admin_vote = -1) as downvotes,
           COUNT(*) as total
         FROM collected_items WHERE source_id = $1 AND admin_vote != 0`,
        [rows[0].source_id]
      );
      const { upvotes, downvotes, total } = stats[0];
      if (parseInt(total) > 0) {
        // yield_score = ratio of upvotes to total votes, blended with current score
        const voteRatio = parseInt(upvotes) / (parseInt(upvotes) + parseInt(downvotes));
        // Blend: 60% vote-derived, 40% existing (so a few votes don't completely override)
        const { rows: src } = await pool.query(`SELECT yield_score FROM sources WHERE id = $1`, [rows[0].source_id]);
        const currentYield = src[0]?.yield_score ?? 0.5;
        const blendedYield = Math.round((voteRatio * 0.6 + currentYield * 0.4) * 100) / 100;
        await pool.query(
          `UPDATE sources SET yield_score = $1, updated_at = now() WHERE id = $2`,
          [blendedYield, rows[0].source_id]
        );
      }
    }

    return respond(200);
  });

  // Admin feedback: add note to an item
  app.post("/items/:id/note", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { note } = request.body as { note: string };
    await pool.query(
      `UPDATE collected_items SET admin_note = $1 WHERE id = $2`,
      [note?.trim() || null, id]
    );
    return reply.redirect("/admin/items");
  });

  // Admin feedback: rate a source (+1 good, -1 bad, 0 neutral)
  app.post("/sources/:id/rate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rating } = request.body as { rating: string };
    const ratingVal = parseInt(rating);
    if (ratingVal !== 1 && ratingVal !== -1 && ratingVal !== 0) return reply.redirect("/admin/sources");

    await pool.query(
      `UPDATE sources SET admin_rating = $1, updated_at = now() WHERE id = $2`,
      [ratingVal, id]
    );

    // If downvoted, reduce yield_score; if upvoted, boost it
    if (ratingVal === -1) {
      await pool.query(
        `UPDATE sources SET yield_score = GREATEST(0, yield_score - 0.2), updated_at = now() WHERE id = $1`,
        [id]
      );
    } else if (ratingVal === 1) {
      await pool.query(
        `UPDATE sources SET yield_score = LEAST(1, yield_score + 0.15), updated_at = now() WHERE id = $1`,
        [id]
      );
    }

    return reply.redirect("/admin/sources");
  });

  // Downvoted items list
  app.get("/downvoted", async (request, reply) => {
    const user = (request as any).user;
    const { rows: items } = await pool.query(
      `SELECT ci.*, COALESCE(ci.ai_summary, ci.summary) as summary,
              s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.admin_vote = -1
       ORDER BY ci.collected_at DESC
       LIMIT 200`
    );
    return reply.view("admin/downvoted.ejs", { user, items });
  });

  // Restore a downvoted item
  app.post("/items/:id/restore", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(
      `UPDATE collected_items SET admin_vote = 0, admin_comment = NULL, status = 'pending' WHERE id = $1`,
      [id]
    );
    return reply.redirect("/admin/downvoted");
  });

  // Re-enrich a single item with optional feedback (admin 🔁 button)
  app.post("/items/:id/reenrich", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { feedback?: string };
    const { enrichSingleItem } = await import("../workers/enrichment.js");
    const ok = await enrichSingleItem(id, body.feedback || "");
    return reply.send({ ok, message: ok ? "Re-enriched successfully" : "Failed to re-enrich" });
  });

  // Admin feedback dashboard — all voted items
  app.get("/feedback", async (request, reply) => {
    const user = (request as any).user;
    const { rows: upvoted } = await pool.query(
      `SELECT ci.id, COALESCE(ci.ai_headline, ci.title) as title, ci.admin_comment,
              ci.category, ci.region, ci.collected_at, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.admin_vote = 1 AND ci.admin_comment IS NOT NULL
       ORDER BY ci.collected_at DESC LIMIT 100`
    );
    const { rows: downvoted } = await pool.query(
      `SELECT ci.id, COALESCE(ci.ai_headline, ci.title) as title, ci.admin_comment,
              ci.category, ci.region, ci.collected_at, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.admin_vote = -1 AND ci.admin_comment IS NOT NULL
       ORDER BY ci.collected_at DESC LIMIT 100`
    );
    return reply.view("admin/feedback.ejs", { user, upvoted, downvoted });
  });

  // Update admin comment on a voted item (from feedback dashboard)
  app.post("/items/:id/comment", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comment: string };
    if (!body.comment?.trim()) return reply.code(400).send({ error: "Comment required" });
    await pool.query(
      `UPDATE collected_items SET admin_comment = $1 WHERE id = $2`,
      [body.comment.trim().substring(0, 1000), id]
    );
    return reply.send({ ok: true });
  });

  // Pin/unpin an item
  app.post("/items/:id/pin", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(
      `UPDATE collected_items SET pinned_at = CASE WHEN pinned_at IS NULL THEN now() ELSE NULL END WHERE id = $1`,
      [id]
    );
    const isAjax = (request.headers["accept"] || "").indexOf("text/html") === -1;
    if (isAjax) return reply.send({ ok: true });
    return reply.redirect("/admin/items");
  });

  // Waitlist management
  app.get("/waitlist", async (request, reply) => {
    const user = (request as any).user;
    const { rows: waitlist } = await pool.query(
      `SELECT id, email, name, source, user_id, referrer, notified, notified_at, created_at
       FROM waitlist
       ORDER BY created_at DESC
       LIMIT 500`
    );
    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE source = 'google')::int as google_count,
         COUNT(*) FILTER (WHERE source = 'email')::int as email_count,
         COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int as last_24h,
         COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int as last_7d
       FROM waitlist`
    );
    return reply.view("admin/waitlist.ejs", { user, waitlist, stats: stats[0] });
  });

  // CSV export of waitlist
  app.get("/waitlist.csv", async (request, reply) => {
    const { rows: waitlist } = await pool.query(
      `SELECT email, name, source, created_at FROM waitlist ORDER BY created_at DESC`
    );
    const csvRows = ["email,name,source,signed_up_at"];
    for (const w of waitlist) {
      const escape = (s: any) => {
        if (s === null || s === undefined) return "";
        const str = String(s).replace(/"/g, '""');
        return /[",\n]/.test(str) ? `"${str}"` : str;
      };
      csvRows.push(`${escape(w.email)},${escape(w.name)},${escape(w.source)},${new Date(w.created_at).toISOString()}`);
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="portal-intel-waitlist-${new Date().toISOString().split("T")[0]}.csv"`);
    return reply.send(csvRows.join("\n"));
  });

  // User management
  app.get("/users", async (request, reply) => {
    const user = (request as any).user;
    const { rows: users } = await pool.query(
      `SELECT u.id, u.name, u.email, u.image, u."createdAt",
              up.role, up.onboarded, up.status, up.preferences,
              (SELECT COUNT(*) FROM saved_items WHERE user_id = u.id)::int as saved_count,
              (SELECT COUNT(*) FROM comments WHERE author_id = u.id)::int as comment_count
       FROM "user" u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       ORDER BY
         CASE WHEN up.role = 'admin' THEN 0 ELSE 1 END,
         u."createdAt" DESC
       LIMIT 200`
    );
    return reply.view("admin/users.ejs", { user, users });
  });

  app.post("/users/:id/role", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = request.body as { role: string };
    if (role !== "admin" && role !== "subscriber") return reply.redirect("/admin/users");

    await pool.query(
      `INSERT INTO user_profiles (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = $2, updated_at = now()`,
      [id, role]
    );
    return reply.redirect("/admin/users");
  });

  // Comment moderation
  app.get("/comments", async (request, reply) => {
    const user = (request as any).user;
    const { rows: flagged } = await pool.query(
      `SELECT c.*, u.name as author_name, u.email as author_email,
              CASE c.target_type
                WHEN 'item' THEN (SELECT title FROM collected_items WHERE id = c.target_id)
                WHEN 'discussion' THEN (SELECT title FROM discussions WHERE id = c.target_id)
                WHEN 'meetup' THEN (SELECT title FROM meetups WHERE id = c.target_id)
              END as target_title
       FROM comments c
       LEFT JOIN "user" u ON c.author_id = u.id
       WHERE c.status IN ('flagged', 'hidden')
       ORDER BY c.status DESC, c.created_at DESC
       LIMIT 100`
    );
    const { rows: recent } = await pool.query(
      `SELECT c.*, u.name as author_name,
              CASE c.target_type
                WHEN 'item' THEN (SELECT title FROM collected_items WHERE id = c.target_id)
                WHEN 'discussion' THEN (SELECT title FROM discussions WHERE id = c.target_id)
                WHEN 'meetup' THEN (SELECT title FROM meetups WHERE id = c.target_id)
              END as target_title
       FROM comments c
       LEFT JOIN "user" u ON c.author_id = u.id
       WHERE c.status = 'visible'
       ORDER BY c.created_at DESC
       LIMIT 50`
    );
    return reply.view("admin/comments.ejs", { user, flagged, recent });
  });

  app.post("/comments/:id/hide", async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    await pool.query(
      `UPDATE comments SET status = 'hidden', hidden_by = $1, hidden_at = now() WHERE id = $2`,
      [user.id, id]
    );
    return reply.send({ hidden: true });
  });

  app.post("/comments/:id/restore", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(
      `UPDATE comments SET status = 'visible', hidden_by = NULL, hidden_at = NULL,
                          flag_reason = NULL, flagged_by = NULL
       WHERE id = $1`,
      [id]
    );
    return reply.redirect("/admin/comments");
  });

  app.post("/comments/:id/delete", async (request, reply) => {
    const { id } = request.params as { id: string };
    await pool.query(`DELETE FROM comments WHERE id = $1`, [id]);
    return reply.redirect("/admin/comments");
  });

  // Meetup management
  app.get("/events", async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { fb_url?: string; fb_error?: string; fb_imported?: string; call_created?: string };
    const { rows: meetups } = await pool.query(
      `SELECT m.*, COUNT(r.id)::int as rsvp_count
       FROM meetups m LEFT JOIN meetup_rsvps r ON r.meetup_id = m.id
       GROUP BY m.id ORDER BY m.event_date DESC`
    );
    return reply.view("admin/events.ejs", { user, meetups, flash: query });
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
