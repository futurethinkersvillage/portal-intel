import { FastifyInstance } from "fastify";
import { getUser } from "../lib/middleware.js";
import { REGIONS } from "../lib/categories.js";
import pool from "../lib/db.js";

export async function grantsRoutes(app: FastifyInstance) {
  // Grant deadline calendar — public
  app.get("/", async (request, reply) => {
    const user = await getUser(request);
    const region = (request.query as any).region || "";

    const { rows: grants } = await pool.query(
      `SELECT ci.*, COALESCE(ci.ai_summary, ci.summary) as summary,
              ci.ai_actionability, s.name as source_name
       FROM collected_items ci
       LEFT JOIN sources s ON ci.source_id = s.id
       WHERE ci.category = 'grants'
         AND ci.status IN ('approved', 'feed', 'newsletter')
         AND (ci.expires_at IS NULL OR ci.expires_at > now())
         ${region ? `AND ci.region = '${region}'` : ""}
       ORDER BY
         CASE WHEN ci.expires_at IS NULL THEN 1 ELSE 0 END,
         ci.expires_at ASC,
         ci.total_score DESC
       LIMIT 200`
    );

    // Group by month of deadline
    const grouped: Record<string, typeof grants> = {};
    const noDeadline: typeof grants = [];

    for (const g of grants) {
      if (!g.expires_at) {
        noDeadline.push(g);
      } else {
        const key = new Date(g.expires_at).toLocaleDateString("en-CA", { year: "numeric", month: "long" });
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(g);
      }
    }

    const months = Object.entries(grouped).map(([label, items]) => ({ label, items }));

    return reply.view("grants.ejs", { user, months, noDeadline, regions: REGIONS, activeRegion: region });
  });
}
