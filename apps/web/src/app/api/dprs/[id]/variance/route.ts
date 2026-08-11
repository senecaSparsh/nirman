import { NextRequest } from "next/server";
import { runDprVarianceAnalysis } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/dprs/[id]/variance
 * Run variance analysis on a DPR and optionally auto-generate scrap.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const schema = z.object({
    autoGenerateScrap: z.boolean().optional().default(false),
    scrapToLocationId: z.string().optional(),
    scrapValuationPct: z.number().min(0).max(100).optional(),
  });

  const parsed = schema.parse(body);

  const result = await runDprVarianceAnalysis(id, {
    companyId: company.id,
    autoGenerateScrap: parsed.autoGenerateScrap,
    scrapToLocationId: parsed.scrapToLocationId,
    scrapValuationPct: parsed.scrapValuationPct,
    userId: user.id,
  });

  return json({
    dprId: result.dprId,
    workType: result.workType,
    variances: result.variances.map((v) => ({
      materialId: v.materialId,
      materialCode: v.materialCode,
      materialName: v.materialName,
      unit: v.unit,
      actualQty: toNum(v.actualQty),
      standardQty: toNum(v.standardQty),
      variance: toNum(v.variance),
      variancePct: toNum(v.variancePct),
      isOverConsumption: v.isOverConsumption,
    })),
    overConsumptionLines: result.overConsumptionLines.map((l) => ({
      ...l,
      scrapQty: toNum(l.scrapQty),
    })),
    scrapGenerationId: result.scrapGenerationId,
  });
});
