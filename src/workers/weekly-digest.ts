import pool from "../lib/db.js";
import { sendBulkEmails } from "../lib/email.js";
import { trackUsage } from "../lib/api-usage.js";
import { CATEGORIES } from "../lib/categories.js";

const BASE_URL = process.env.BASE_URL || "https://portal.place";

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.slug, c.label])
);

function renderDigest(
  topDeals: any[],
  closingGrants: any[],
  upcomingEvents: any[],
  unsubscribeToken: string
): string {
  const dealRows = topDeals
    .map(
      (i) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #292524;">
        <a href="${i.url || BASE_URL + "/feed"}" style="color: #e7e5e4; text-decoration: none; font-weight: 500; font-size: 14px;">${i.title}</a>
        <div style="color: #78716c; font-size: 12px; margin-top: 3px;">${i.summary || ""}</div>
        ${i.ai_actionability ? `<div style="color: #6B6BAA; font-size: 11px; margin-top: 2px;">→ ${i.ai_actionability}</div>` : ""}
        <div style="color: #57534e; font-size: 11px; margin-top: 2px;">${(CATEGORY_LABELS[i.category] || i.category).toUpperCase()} · ${i.region.toUpperCase()}</div>
      </td>
    </tr>`
    )
    .join("");

  const grantRows = closingGrants
    .map((i) => {
      const daysLeft = i.expires_at
        ? Math.ceil((new Date(i.expires_at).getTime() - Date.now()) / 86400000)
        : null;
      return `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #292524;">
        <a href="${i.url || BASE_URL + "/grants"}" style="color: #fbbf24; text-decoration: none; font-weight: 500; font-size: 14px;">${i.title}</a>
        ${daysLeft !== null ? `<span style="color: #d97706; font-size: 11px; margin-left: 8px;">${daysLeft}d left</span>` : ""}
        <div style="color: #78716c; font-size: 12px; margin-top: 2px;">${i.summary || ""}</div>
      </td>
    </tr>`;
    })
    .join("");

  const eventRows = upcomingEvents
    .map(
      (m) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #292524;">
        <a href="${BASE_URL}/events/${m.slug}" style="color: #e7e5e4; text-decoration: none; font-weight: 500; font-size: 14px;">${m.title}</a>
        <div style="color: #78716c; font-size: 12px; margin-top: 2px;">${m.location} · ${new Date(m.event_date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</div>
      </td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0a09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" style="background:#0c0a09;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">

      <tr><td style="padding:0 0 20px 0;border-bottom:1px solid #292524;">
        <span style="color:#6B6BAA;font-weight:700;font-size:16px;">Portal.Place Intel</span>
        <span style="color:#57534e;font-size:12px;float:right;">Weekly Deals &amp; Deadlines</span>
      </td></tr>

      ${dealRows ? `
      <tr><td style="padding:18px 0 8px 0;">
        <span style="color:#10b981;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">🏔️ Top Opportunities This Week</span>
      </td></tr>
      <table width="100%" cellspacing="0" cellpadding="0">${dealRows}</table>` : ""}

      ${grantRows ? `
      <tr><td style="padding:18px 0 8px 0;">
        <span style="color:#fbbf24;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">⏳ Grant Deadlines — Act Now</span>
      </td></tr>
      <table width="100%" cellspacing="0" cellpadding="0">${grantRows}</table>` : ""}

      ${eventRows ? `
      <tr><td style="padding:18px 0 8px 0;">
        <span style="color:#f43f5e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">📅 Upcoming Meetups</span>
      </td></tr>
      <table width="100%" cellspacing="0" cellpadding="0">${eventRows}</table>` : ""}

      <tr><td align="center" style="padding:24px 0;">
        <a href="${BASE_URL}/feed" style="display:inline-block;background:#4D4DC0;color:white;text-decoration:none;font-weight:500;font-size:14px;padding:12px 24px;border-radius:8px;">See Full Intel Feed →</a>
      </td></tr>

      <tr><td style="padding:16px 0 0 0;border-top:1px solid #292524;text-align:center;">
        <div style="color:#57534e;font-size:11px;">
          <a href="${BASE_URL}/preferences" style="color:#78716c;text-decoration:none;">Preferences</a> ·
          <a href="${BASE_URL}/unsubscribe/${unsubscribeToken}" style="color:#78716c;text-decoration:none;">Unsubscribe</a>
        </div>
        <div style="color:#44403c;font-size:11px;margin-top:6px;">Portal.Place Intel · BC &amp; Alberta</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendWeeklyDigest() {
  // Top 5 land deals by score from last 7 days
  const { rows: topDeals } = await pool.query(
    `SELECT id, title, COALESCE(ai_summary, summary) as summary, url, category, region, ai_actionability
     FROM collected_items
     WHERE status IN ('approved', 'feed', 'newsletter')
       AND (expires_at IS NULL OR expires_at > now())
       AND collected_at > now() - interval '7 days'
     ORDER BY total_score DESC
     LIMIT 7`
  );

  // Grants closing within 14 days
  const { rows: closingGrants } = await pool.query(
    `SELECT id, title, COALESCE(ai_summary, summary) as summary, url, expires_at
     FROM collected_items
     WHERE category = 'grants'
       AND status IN ('approved', 'feed', 'newsletter')
       AND expires_at IS NOT NULL
       AND expires_at BETWEEN now() AND now() + interval '14 days'
     ORDER BY expires_at ASC
     LIMIT 5`
  );

  // Upcoming public meetups this month
  const { rows: upcomingEvents } = await pool.query(
    `SELECT slug, title, location, event_date
     FROM meetups
     WHERE is_public = true AND event_date > now() AND event_date < now() + interval '30 days'
     ORDER BY event_date ASC LIMIT 3`
  );

  if (topDeals.length === 0 && closingGrants.length === 0) {
    console.log("[Weekly Digest] Nothing to send this week.");
    return;
  }

  const { rows: subscribers } = await pool.query(
    `SELECT up.unsubscribe_token, u.email
     FROM user_profiles up
     JOIN "user" u ON u.id = up.user_id
     WHERE up.status = 'active' AND u.email IS NOT NULL`
  );

  if (subscribers.length === 0) {
    console.log("[Weekly Digest] No subscribers.");
    return;
  }

  await sendBulkEmails(
    subscribers,
    "Portal.Place Intel — Your Weekly Deals & Deadlines",
    (token) => renderDigest(topDeals, closingGrants, upcomingEvents, token)
  );

  console.log(`[Weekly Digest] Sent to ${subscribers.length} subscribers.`);
}

// Runs every Sunday at 8am (checks if it's time)
export function startWeeklyDigestLoop() {
  const checkAndSend = async () => {
    const now = new Date();
    // Run on Sundays (day 0) between 8:00–8:59am
    if (now.getUTCDay() === 0 && now.getUTCHours() === 15) { // 15 UTC = ~8am PT
      try {
        await sendWeeklyDigest();
      } catch (err) {
        console.error("[Weekly Digest] Error:", err);
      }
    }
  };

  // Check every hour
  const interval = setInterval(checkAndSend, 60 * 60 * 1000);
  return interval;
}
