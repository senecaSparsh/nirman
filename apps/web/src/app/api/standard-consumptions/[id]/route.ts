import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateStandardConsumption, deleteStandardConsumption } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/standard-consumptions/[id]
 * Fetch a single standard consumption benchmark by ID.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const sc = await prisma.standardConsumption.findFirst({
    where: { id, companyId: company.id },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  });
  if (!sc) return json({ error: "Standard consumption not found" }, { status: 404 });
  return json({
    ...sc,
    standardQty: sc.standardQty.toString(),
    baseQty: sc.baseQty.toString(),
  });
});

/**
 * PATCH /api/standard-consumptions/[id]
 * Update a standard consumption benchmark.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();

  const updateSchema = z.object({
    workType: z.string().min(1).optional(),
    materialId: z.string().min(1).optional(),
    standardQty: z.union([z.number(), z.string()]).optional(),
    baseQty: z.union([z.number(), z.string()]).optional(),
    unitOfMeasure: z.string().min(1).optional(),
    notes: z.string().optional().nullable(),
  });

  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return json({ error: result.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const parsed = result.data;

  const sc = await updateStandardConsumption(id, {
    workType: parsed.workType,
    materialId: parsed.materialId,
    standardQty: parsed.standardQty,
    baseQty: parsed.baseQty,
    unitOfMeasure: parsed.unitOfMeasure,
    notes: parsed.notes,
  }, user.id);

  return json({ id: sc.id });
});

/**
 * DELETE /api/standard-consumptions/[id]
 * Delete a standard consumption benchmark.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  await deleteStandardConsumption(id, user.id);
  return json({ ok: true });
});
