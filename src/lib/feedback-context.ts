import pool from "./db.js";

/**
 * Builds a context string from recent admin downvotes to inject into AI prompts.
 * This allows the enrichment pipeline to learn from admin feedback over time.
 */
export async function getDownvoteFeedbackContext(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT title, category, admin_comment
     FROM collected_items
     WHERE admin_vote = -1 AND admin_comment IS NOT NULL AND admin_comment != ''
     ORDER BY collected_at DESC LIMIT 20`
  );

  if (rows.length === 0) return "";

  const examples = rows
    .map((r: any) => `- "${r.title}" (${r.category}): ${r.admin_comment}`)
    .join("\n");

  return `\nItems REJECTED by admin — learn from these patterns and avoid similar content:\n${examples}\n`;
}
