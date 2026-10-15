import { NextRequest } from "next/server";
import { runDepreciation } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/depreciation — monthly equipment depreciation run.
 *
 * Equipment sits at acquisition cost forever without it — the balance sheet
 * silently overstates fixed assets. Per company, per asset with a rate:
 * straight-line monthly charge (acquisitionCost × rate / 12), capped at the
 * remaining book value. Posts Dr Depreciation Expense / Cr Accumulated
 * Depreciation and updates Equipment.currentValue.
 *
 * Idempotent per calendar month — the JE dedupes on asset+period, so the
 * scheduler can call this daily and only the first call each month posts.
 *
 * Auth: x-cron-secret header (same as /api/cron/backup).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return withTimeout(run(), 120_000, "depreciation run timed out");
}, { skipSession: true, rateLimit: false });

async function run(): Promise<Response> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const results = [];
  for (const c of companies) {
    try {
      const r = await runDepreciation({ companyId: c.id });
      results.push({ companyId: c.id, name: c.name, ...r });
    } catch (err) {
      results.push({ companyId: c.id, name: c.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return json({ ok: true, results });
}
