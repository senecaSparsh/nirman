import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  // Revalidate pages affected by variance analysis + scrap generation
  revalidatePath("/hr/daily-reports");
  revalidatePath("/hr/dprs");
  revalidatePath("/m/dprs");
    revalidatePath("/m/hr?tab=dprs");
  if (result.scrapGenerationId) {
    revalidatePath("/stock");
    revalidatePath("/m/inventory");
    revalidatePath("/scrap-generations");
    revalidatePath("/m/stock");
  }

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
