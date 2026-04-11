import pool from "../lib/db.js";
import { sendEmail } from "../lib/email.js";
import { isEnabled } from "../lib/system-settings.js";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";

export async function sendDailyAlerts() {
  // Find users with alert categories
  const { rows: users } = await pool.query(
    `SELECT up.user_id, up.alert_categories, up.unsubscribe_token, u.email, u.name
     FROM user_profiles up
     JOIN "user" u ON up.user_id = u.id
     WHERE up.status = 'active'
       AND up.alert_categories != '{}'
       AND array_length(up.alert_categories, 1) > 0`
  );

  if (users.length === 0) return;

  // Get new items from the last 24 hours in alert-eligible categories
  const { rows: newItems } = await pool.query(
    `SELECT * FROM collected_items
     WHERE status IN ('approved', 'feed')
       AND collected_at > now() - interval '24 hours'
     ORDER BY total_score DESC`
  );

  if (newItems.length === 0) return;

  let sent = 0;
  for (const user of users) {
    const alertCategories = user.alert_categories as string[];
    const relevantItems = newItems
      .filter((item: any) => alertCategories.includes(item.category))
      .slice(0, 5); // Max 5 items per alert

    if (relevantItems.length === 0) continue;

    const itemsHTML = relevantItems
      .map((item: any) => {
        return `<li style="margin-bottom: 8px;">
          <a href="${item.url || baseUrl + "/feed"}" style="color: #e7e5e4; text-decoration: none; font-weight: 500;">${item.title}</a>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">${item.summary || ""}</div>
        </li>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; background-color: #0c0a09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0a09;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width: 560px; width: 100%;">
          <tr>
            <td style="padding: 0 0 16px 0;">
              <span style="color: #4ade80; font-weight: 700; font-size: 14px;">Portal.Place Intel</span>
              <span style="color: #57534e; font-size: 12px;"> &middot; Daily Alert</span>
            </td>
          </tr>
          <tr>
            <td>
              <div style="color: #a8a29e; font-size: 13px; margin-bottom: 12px;">${relevantItems.length} new item${relevantItems.length !== 1 ? "s" : ""} in your watched categories:</div>
              <ul style="margin: 0; padding-left: 16px; font-size: 13px;">${itemsHTML}</ul>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0;">
              <a href="${baseUrl}/feed" style="color: #4ade80; font-size: 13px; text-decoration: none;">See all on Intel Feed &rarr;</a>
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #292524; padding: 16px 0 0 0;">
              <div style="color: #57534e; font-size: 11px;">
                <a href="${baseUrl}/preferences" style="color: #78716c; text-decoration: none;">Manage alerts</a> &middot;
                <a href="${baseUrl}/unsubscribe/${user.unsubscribe_token}" style="color: #78716c; text-decoration: none;">Unsubscribe</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await sendEmail(user.email, `Intel Alert: ${relevantItems.length} new items`, html);
      sent++;
    } catch (err) {
      console.error(`[Daily Alert] Failed to send to ${user.email}:`, err);
    }
  }

  console.log(`[Daily Alerts] Sent ${sent} alerts to ${users.length} users`);
}

// Run daily at 8am
export function startDailyAlertLoop() {
  const interval = setInterval(async () => {
    if (!(await isEnabled("alerts_enabled"))) return;
    sendDailyAlerts().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  return interval;
}
