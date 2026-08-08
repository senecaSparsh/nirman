import { NextRequest } from "next/server";
import { getVendorRankings } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const rankings = await getVendorRankings(company.id);
  return json(rankings.map((r) => ({
    ...r,
    onTimeRate: r.onTimeRate.toNumber(),
    qualityRate: r.qualityRate.toNumber(),
    priceCompetitiveness: r.priceCompetitiveness.toNumber(),
    overallScore: r.overallScore.toNumber(),
  })));
});
