import { CATEGORIES } from "./categories.js";

interface NewsletterItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  category: string;
  region: string;
  expires_at: string | null;
  submitted_by: string | null;
}

interface NewsletterData {
  issueNumber: number;
  subject: string;
  engagementQuestion: string;
  editorialIntro?: string;
  items: NewsletterItem[];
  baseUrl: string;
}

const categoryLabels: Record<string, string> = {};
CATEGORIES.forEach((c) => { categoryLabels[c.slug] = c.label; });

export function renderNewsletter(data: NewsletterData, unsubscribeToken: string): string {
  const { issueNumber, subject, engagementQuestion, editorialIntro, items, baseUrl } = data;

  // Group items by category
  const grouped: Record<string, NewsletterItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  // Find closing-soon items
  const closingSoon = items.filter((item) => {
    if (!item.expires_at) return false;
    const daysLeft = (new Date(item.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft > 0 && daysLeft <= 7;
  });

  let categoryHTML = "";
  for (const [slug, catItems] of Object.entries(grouped)) {
    const label = categoryLabels[slug] || slug;
    const itemsHTML = catItems
      .map((item) => {
        const submittedBadge = item.submitted_by
          ? `<span style="color: #EA824E; font-size: 11px;"> &middot; Community submitted</span>`
          : "";
        return `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #292524;">
            <a href="${item.url || baseUrl + '/feed'}" style="color: #e7e5e4; text-decoration: none; font-weight: 500; font-size: 14px;">${item.title}</a>${submittedBadge}
            <div style="color: #78716c; font-size: 12px; margin-top: 2px;">${item.summary || ""}</div>
            <div style="color: #57534e; font-size: 11px; margin-top: 2px;">${item.region.toUpperCase()}${item.expires_at ? ` &middot; Closes ${new Date(item.expires_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : ""}</div>
          </td>
        </tr>`;
      })
      .join("");

    categoryHTML += `
      <tr>
        <td style="padding: 20px 0 8px 0;">
          <span style="color: #6B6BAA; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">${label}</span>
        </td>
      </tr>
      ${itemsHTML}`;
  }

  let closingSoonHTML = "";
  if (closingSoon.length > 0) {
    const closingItems = closingSoon
      .map((item) => {
        const daysLeft = Math.ceil((new Date(item.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return `<li style="margin-bottom: 4px;"><a href="${item.url || "#"}" style="color: #fbbf24; text-decoration: none;">${item.title}</a> <span style="color: #78716c;">&mdash; ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span></li>`;
      })
      .join("");

    closingSoonHTML = `
      <tr>
        <td style="padding: 20px 0 8px 0;">
          <span style="color: #fbbf24; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Closing Soon</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 0 16px 0;">
          <ul style="margin: 0; padding-left: 16px; color: #e7e5e4; font-size: 13px;">${closingItems}</ul>
        </td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0c0a09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0a09;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width: 560px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="padding: 0 0 24px 0; border-bottom: 1px solid #292524;">
              <span style="color: #6B6BAA; font-weight: 700; font-size: 16px;">Portal.Place Intel</span>
              <span style="color: #57534e; font-size: 13px; float: right;">Issue #${issueNumber}</span>
            </td>
          </tr>

          <!-- Editorial Intro -->
          ${editorialIntro ? `<tr>
            <td style="padding: 20px 0 16px 0; color: #a8a29e; font-size: 14px; line-height: 1.6;">
              ${editorialIntro}
            </td>
          </tr>` : ""}

          <!-- Items by Category -->
          ${categoryHTML}

          <!-- Closing Soon -->
          ${closingSoonHTML}

          <!-- Engagement Question -->
          <tr>
            <td style="padding: 24px 0; border-top: 1px solid #292524;">
              <div style="background: #1c1917; border: 1px solid #292524; border-radius: 8px; padding: 16px;">
                <div style="color: #a8a29e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your Input</div>
                <div style="color: #e7e5e4; font-size: 14px; margin-bottom: 12px;">${engagementQuestion}</div>
                <a href="${baseUrl}/submit" style="color: #6B6BAA; font-size: 13px; text-decoration: none;">Submit to Intel &rarr;</a>
              </div>
            </td>
          </tr>

          <!-- Feed CTA -->
          <tr>
            <td align="center" style="padding: 16px 0;">
              <a href="${baseUrl}/feed" style="display: inline-block; background: #4D4DC0; color: white; text-decoration: none; font-weight: 500; font-size: 14px; padding: 12px 24px; border-radius: 8px;">See Everything on the Intel Feed &rarr;</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0 0; border-top: 1px solid #292524; text-align: center;">
              <div style="color: #57534e; font-size: 11px;">
                <a href="${baseUrl}/preferences" style="color: #78716c; text-decoration: none;">Manage preferences</a> &middot;
                <a href="${baseUrl}/unsubscribe/${unsubscribeToken}" style="color: #78716c; text-decoration: none;">Unsubscribe</a>
              </div>
              <div style="color: #44403c; font-size: 11px; margin-top: 8px;">
                Portal.Place Intel &middot; BC &amp; Alberta Regional Intelligence
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
