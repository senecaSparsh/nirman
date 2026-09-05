import { NextResponse } from "next/server";
import { runBookReconciliation } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, requirePermission } from "@/lib/server";

/**
 * GET /api/health/books
 *
 * Runs all five reconciliation checks (stock ledger, inventory GL, land
 * costs, unit costs, trial balance) and returns the full report.
 *
 * Requires FINANCE_VIEW — this is a financial trust surface, not a
 * liveness probe (use /api/health for liveness).
 *
 * All checks are read-only and safe to run at any time.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const report = await runBookReconciliation(company.id);

  return NextResponse.json(
    {
      timestamp: report.timestamp,
      companyId: report.companyId,
      allPass: report.allPass,
      summary: report.summary,
      checks: report.checks.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        expected: c.expected,
        actual: c.actual,
        delta: c.delta,
        tolerance: c.tolerance,
        message: c.message,
        details: c.details,
      })),
    },
    { status: report.allPass ? 200 : 200, headers: { "Cache-Control": "no-store" } },
  );
});
