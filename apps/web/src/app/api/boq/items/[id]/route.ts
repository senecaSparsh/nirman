import { NextRequest } from "next/server";
import { updateBoqItem, deleteBoqItem } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  description: z.string().optional(),
  serialNo: z.string().optional(),
  materialId: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  estimatedQty: z.coerce.number().optional().nullable(),
  rate: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const item = await updateBoqItem(id, {
      description: d.description,
      serialNo: d.serialNo,
      materialId: d.materialId ?? undefined,
      unit: d.unit ?? undefined,
      estimatedQty: d.estimatedQty ?? undefined,
      rate: d.rate ?? undefined,
      notes: d.notes ?? undefined,
      sortOrder: d.sortOrder,
      userId: user.id,
    });
    return json(item);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  try {
    await deleteBoqItem(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
