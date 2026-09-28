import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { autoSyncBatchToTally } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/tally-sync — retry the Tally sync backlog.
 *
 * `autoSyncEntryToTally` fires on every journal write, but it's
 * best-effort fire-and-forget — a transient failure (Tally down, network
 * blip) marks the entry FAILED in TallySyncLog and it's never retried on its
 * own. The books then silently diverge from Tally until someone opens the
 * sync page. This job re-runs the batch so a failed entry self-heals instead
 * of needing a human to notice.
 *
 * `autoSyncBatchToTally` no-ops for companies without Tally enabled, so this
 * is safe to run for all companies — the per-company enabled check inside
 * the service does the gating.
 *
 * Auth: x-cron-secret header (same as /api/cron/backup). Scheduled by the
 * scheduler sidecar.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return withTimeout(run(), 120_000, "tally-sync timed out");
}, { skipSession: true, rateLimit: false });

async function run(): Promise<Response> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const results: { companyId: string; ok: boolean; error?: string }[] = [];
  for (const company of companies) {
    try {
      // autoSyncBatchToTally internally checks Tally is enabled + autoSync on,
      // so companies without the integration configured are a no-op.
      await autoSyncBatchToTally(company.id);
      results.push({ companyId: company.id, ok: true });
    } catch (err) {
      console.error(`[cron/tally-sync] failed for company ${company.id}:`, err);
      results.push({
        companyId: company.id,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
  return json({ ok: true, results });
}
