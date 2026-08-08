import { NextRequest } from "next/server";
import { updateStandardConsumption, deleteStandardConsumption } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

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

  const parsed = updateSchema.parse(body);

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
