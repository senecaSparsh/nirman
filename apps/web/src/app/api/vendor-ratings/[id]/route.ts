import { NextRequest } from "next/server";
import { computeVendorRating } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const { id } = await params;
  const rating = await computeVendorRating(id);
  return json({
    ...rating,
    onTimeRate: rating.onTimeRate.toNumber(),
    qualityRate: rating.qualityRate.toNumber(),
    priceCompetitiveness: rating.priceCompetitiveness.toNumber(),
    overallScore: rating.overallScore.toNumber(),
  });
});
