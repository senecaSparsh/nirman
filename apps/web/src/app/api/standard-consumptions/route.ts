import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createStandardConsumption, listStandardConsumptions, listWorkTypes } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/standard-consumptions?workType=Foundation
 * List standard consumption benchmarks for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const workType = searchParams.get("workType") ?? undefined;

  const [benchmarks, workTypes] = await Promise.all([
    listStandardConsumptions(company.id, workType),
    listWorkTypes(company.id),
  ]);

  return json({
    rows: benchmarks.map((b) => ({
      ...b,
      standardQty: b.standardQty.toString(),
      baseQty: b.baseQty.toString(),
    })),
    workTypes,
  });
});

const createSchema = z.object({
  workType: z.string().min(1),
  materialId: z.string().min(1),
  standardQty: z.union([z.number(), z.string()]),
  baseQty: z.union([z.number(), z.string()]).optional(),
  unitOfMeasure: z.string().min(1),
  notes: z.string().optional().nullable(),
});

/**
 * POST /api/standard-consumptions
 * Create a new standard consumption benchmark.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const result = createSchema.safeParse(body);
  if (!result.success) {
    return json({ error: result.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const parsed = result.data;

  const sc = await createStandardConsumption({
    companyId: company.id,
    workType: parsed.workType,
    materialId: parsed.materialId,
    standardQty: parsed.standardQty,
    baseQty: parsed.baseQty,
    unitOfMeasure: parsed.unitOfMeasure,
    notes: parsed.notes ?? undefined,
    userId: user.id,
  });

  revalidatePath("/standard-consumptions");
  revalidatePath("/m/standard-consumptions");
  return json({ id: sc.id }, { status: 201 });
});
