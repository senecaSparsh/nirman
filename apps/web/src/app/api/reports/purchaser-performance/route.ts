import { NextRequest } from "next/server";
import { getPurchaserPerformance } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/purchaser-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns per-purchaser metrics: quotes uploaded, requisitions handled,
 * cheapest-selection rate, total spend, and potential savings.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateRange: { from?: Date; to?: Date } = {};
  if (from) dateRange.from = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateRange.to = end;
  }

  const rows = await getPurchaserPerformance(company.id, dateRange);

  return json({
    from: from ?? null,
    to: to ?? null,
    rows: rows.map((r) => ({
      ...r,
      totalSpend: r.totalSpend.toNumber(),
      potentialSavings: r.potentialSavings.toNumber(),
    })),
    count: rows.length,
  });
});
