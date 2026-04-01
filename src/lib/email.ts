import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || "intel@portal.place";

export async function sendEmail(to: string, subject: string, html: string) {
  return resend.emails.send({
    from: `Portal.Place Intel <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

export async function sendBulkEmails(
  recipients: { email: string; unsubscribeToken: string }[],
  subject: string,
  htmlTemplate: (unsubscribeToken: string) => string
) {
  // Resend supports batch sending
  const batch = recipients.map((r) => ({
    from: `Portal.Place Intel <${fromEmail}>`,
    to: r.email,
    subject,
    html: htmlTemplate(r.unsubscribeToken),
  }));

  // Send in batches of 50
  const results = [];
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    const result = await resend.batch.send(chunk);
    results.push(result);
  }

  return results;
}
