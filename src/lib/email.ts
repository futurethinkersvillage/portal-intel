import { Resend } from "resend";
import { trackUsage } from "./api-usage.js";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey && apiKey !== "PLACEHOLDER_NEEDS_SETUP" ? new Resend(apiKey) : null;
const fromEmail = process.env.FROM_EMAIL || "intel@portal.place";

export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[email] Would send to ${to}: ${subject} (no Resend API key configured)`);
    return null;
  }
  const result = await resend.emails.send({
    from: `Portal.Place Intel <${fromEmail}>`,
    to,
    subject,
    html,
  });
  await trackUsage({ service: "resend", operation: "email", units: 1 });
  return result;
}

export async function sendBulkEmails(
  recipients: { email: string; unsubscribeToken: string }[],
  subject: string,
  htmlTemplate: (unsubscribeToken: string) => string
) {
  if (!resend) {
    console.log(`[email] Would send bulk to ${recipients.length} recipients: ${subject} (no Resend API key configured)`);
    return [];
  }

  const batch = recipients.map((r) => ({
    from: `Portal.Place Intel <${fromEmail}>`,
    to: r.email,
    subject,
    html: htmlTemplate(r.unsubscribeToken),
  }));

  const results = [];
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    const result = await resend.batch.send(chunk);
    await trackUsage({ service: "resend", operation: "email-batch", units: chunk.length });
    results.push(result);
  }

  return results;
}
