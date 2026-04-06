import pool from "../lib/db.js";

const WEIGHTS = {
  recency: 0.20,
  actionability: 0.30,
  uniqueness: 0.15,
  sourceQuality: 0.15,
  adminFeedback: 0.20,
};

const ACTION_KEYWORDS = [
  "apply", "deadline", "register", "sign up", "enroll", "bid",
  "for sale", "listing", "available", "hiring", "position",
  "attend", "join", "rsvp", "workshop", "course",
  "grant", "funding", "incentive", "rebate",
  "acres", "lots", "parcels", "property",
];

function scoreRecency(collectedAt: Date): number {
  const hoursAgo = (Date.now() - collectedAt.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) return 1.0;
  if (hoursAgo < 72) return 0.85;
  if (hoursAgo < 168) return 0.7; // 1 week
  if (hoursAgo < 336) return 0.5; // 2 weeks
  if (hoursAgo < 720) return 0.3; // 1 month
  return 0.1;
}

function scoreActionability(title: string, summary: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 0.3; // baseline
  for (const keyword of ACTION_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 0.15;
    }
  }
  return Math.min(score, 1.0);
}

// Simple uniqueness check: penalize if similar titles exist recently
async function scoreUniqueness(title: string, itemId: string): Promise<number> {
  // Check for similar titles in the last 30 days
  const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return 0.5;

  // Check if any of the significant words match recent items
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM collected_items
     WHERE id != $1
       AND collected_at > now() - interval '30 days'
       AND LOWER(title) LIKE ANY($2)`,
    [itemId, words.slice(0, 3).map(w => `%${w}%`)]
  );

  const matchCount = parseInt(rows[0].count);
  if (matchCount === 0) return 1.0;
  if (matchCount <= 2) return 0.7;
  if (matchCount <= 5) return 0.4;
  return 0.2;
}

export async function scoreItems() {
  // Get pending items that have been enriched (or waited long enough)
  const { rows: items } = await pool.query(
    `SELECT ci.*, s.yield_score as source_yield
     FROM collected_items ci
     LEFT JOIN sources s ON ci.source_id = s.id
     WHERE ci.status = 'pending'
       AND (ci.enriched_at IS NOT NULL OR ci.collected_at < now() - interval '15 minutes')
     ORDER BY ci.collected_at DESC
     LIMIT 100`
  );

  // Build a lookup of source admin_ratings for feedback propagation
  const { rows: ratedSources } = await pool.query(
    `SELECT id, admin_rating FROM sources WHERE admin_rating != 0`
  );
  const sourceRatings = new Map(ratedSources.map((s: any) => [s.id, s.admin_rating]));

  let scored = 0;
  for (const item of items) {
    // Skip items that have been manually voted on — admin decision is final
    if (item.admin_vote !== 0) continue;

    const recency = scoreRecency(new Date(item.collected_at));
    // Use AI score if available, otherwise fall back to keyword scoring
    const actionability = item.ai_score != null
      ? item.ai_score
      : scoreActionability(item.title, item.summary || "");
    const uniqueness = await scoreUniqueness(item.title, item.id);
    const sourceQuality = item.source_yield ?? 0.5;

    // Admin feedback signal: derived from source rating + similar item votes
    // Source rating: +1 = 0.8 baseline, -1 = 0.2 baseline, 0 = 0.5
    const srcRating = sourceRatings.get(item.source_id) ?? 0;
    const adminSignal = srcRating === 1 ? 0.8 : srcRating === -1 ? 0.2 : 0.5;

    let totalScore =
      recency * WEIGHTS.recency +
      actionability * WEIGHTS.actionability +
      uniqueness * WEIGHTS.uniqueness +
      sourceQuality * WEIGHTS.sourceQuality +
      adminSignal * WEIGHTS.adminFeedback;

    // Urgency boost for items expiring within 7 days
    if (item.expires_at) {
      const daysUntilExpiry = (new Date(item.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
        totalScore = Math.min(totalScore + 0.15, 1.0);
      } else if (daysUntilExpiry <= 0) {
        // Already expired
        await pool.query(
          `UPDATE collected_items SET status = 'expired' WHERE id = $1`,
          [item.id]
        );
        continue;
      }
    }

    // Determine status based on score
    let newStatus: string;
    if (totalScore >= 0.7) {
      newStatus = "approved"; // eligible for newsletter
    } else if (totalScore >= 0.4) {
      newStatus = "feed"; // visible on feed only
    } else {
      newStatus = "archived";
    }

    await pool.query(
      `UPDATE collected_items SET
        recency_score = $1,
        actionability_score = $2,
        uniqueness_score = $3,
        total_score = $4,
        status = $5
       WHERE id = $6`,
      [recency, actionability, uniqueness, totalScore, newStatus, item.id]
    );

    scored++;
  }

  console.log(`[Scoring] Scored ${scored} items`);
  return scored;
}

// Expire old items
export async function expireItems() {
  const { rowCount } = await pool.query(
    `UPDATE collected_items SET status = 'expired'
     WHERE expires_at IS NOT NULL AND expires_at < now() AND status NOT IN ('expired', 'archived')`
  );
  if (rowCount && rowCount > 0) {
    console.log(`[Expiry] Expired ${rowCount} items`);
  }
}

// Run scoring on an interval
export function startScoringLoop() {
  // Score every 30 minutes
  const interval = setInterval(async () => {
    try {
      await scoreItems();
      await expireItems();
    } catch (err) {
      console.error("[Scoring] Error:", err);
    }
  }, 30 * 60 * 1000);

  // Run immediately
  scoreItems().catch(console.error);
  expireItems().catch(console.error);

  return interval;
}
