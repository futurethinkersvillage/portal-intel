import pool from "./db.js";

// Pricing as of 2026 (per 1M tokens or per unit)
const PRICING = {
  anthropic: {
    // Claude Haiku 4.5: $0.80/MTok input, $4.00/MTok output
    inputPerMTok: 0.80,
    outputPerMTok: 4.00,
  },
  firecrawl: {
    // Firecrawl scrape with extract: ~$0.01 per page (varies by plan)
    perPage: 1.0, // cents
  },
  resend: {
    // Resend: free tier 100/day, then $0.00028 per email (~0.028 cents)
    perEmail: 0.028, // cents
  },
  brave: {
    // Brave Search: free tier 2000/mo, then $0.003 per query (0.3 cents)
    perQuery: 0.3, // cents
  },
};

type Service = "anthropic" | "firecrawl" | "resend" | "brave";

interface UsageEntry {
  service: Service;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  metadata?: Record<string, any>;
}

function estimateCostCents(entry: UsageEntry): number {
  const { service, inputTokens = 0, outputTokens = 0, units = 1 } = entry;

  switch (service) {
    case "anthropic": {
      const p = PRICING.anthropic;
      return (inputTokens / 1_000_000) * p.inputPerMTok * 100 +
             (outputTokens / 1_000_000) * p.outputPerMTok * 100;
    }
    case "firecrawl":
      return units * PRICING.firecrawl.perPage;
    case "resend":
      return units * PRICING.resend.perEmail;
    case "brave":
      return units * PRICING.brave.perQuery;
    default:
      return 0;
  }
}

export async function trackUsage(entry: UsageEntry): Promise<void> {
  const costCents = estimateCostCents(entry);
  try {
    await pool.query(
      `INSERT INTO api_usage (service, operation, input_tokens, output_tokens, units, cost_cents, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.service,
        entry.operation,
        entry.inputTokens || 0,
        entry.outputTokens || 0,
        entry.units || 1,
        costCents,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (err: any) {
    // Non-fatal — don't break API calls if tracking fails
    console.error("[API Usage] Failed to track:", err.message);
  }
}

export interface UsageSummary {
  service: string;
  operation: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalUnits: number;
  totalCostCents: number;
}

export interface UsagePeriod {
  label: string;
  services: UsageSummary[];
  totalCostCents: number;
}

export async function getUsageSummary(): Promise<{
  today: UsagePeriod;
  last7Days: UsagePeriod;
  last30Days: UsagePeriod;
  allTime: UsagePeriod;
}> {
  const query = (where: string, label: string) =>
    pool.query(
      `SELECT service, operation,
              COUNT(*)::int as total_calls,
              COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
              COALESCE(SUM(output_tokens), 0)::int as total_output_tokens,
              COALESCE(SUM(units), 0)::int as total_units,
              COALESCE(SUM(cost_cents), 0)::real as total_cost_cents
       FROM api_usage
       ${where}
       GROUP BY service, operation
       ORDER BY total_cost_cents DESC`
    ).then(({ rows }) => ({
      label,
      services: rows.map((r: any) => ({
        service: r.service,
        operation: r.operation,
        totalCalls: r.total_calls,
        totalInputTokens: r.total_input_tokens,
        totalOutputTokens: r.total_output_tokens,
        totalUnits: r.total_units,
        totalCostCents: r.total_cost_cents,
      })),
      totalCostCents: rows.reduce((sum: number, r: any) => sum + r.total_cost_cents, 0),
    }));

  const [today, last7Days, last30Days, allTime] = await Promise.all([
    query("WHERE created_at >= CURRENT_DATE", "Today"),
    query("WHERE created_at >= now() - interval '7 days'", "Last 7 Days"),
    query("WHERE created_at >= now() - interval '30 days'", "Last 30 Days"),
    query("", "All Time"),
  ]);

  return { today, last7Days, last30Days, allTime };
}
