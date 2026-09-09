import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateBoqItem, deleteBoqItem, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
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
  const user = await requirePermission(PERM.BOQ_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the BOQ item's project belongs to the user's company
  const existing = await prisma.boqItem.findFirst({
    where: { id, project: { companyId: company.id }, ...await scopeWhere("BoqItem") },
    select: { id: true },
  });
  if (!existing) return json({ error: "BOQ item not found" }, { status: 404 });
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
      notes: d.notes,
      sortOrder: d.sortOrder,
      userId: user.id,
    });
    revalidatePath("/boq");
    return json(item);
  } catch (err: unknown) {
    return json({ error: err instanceof ServiceError ? err.message : "Failed to update BOQ item" }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.BOQ_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the BOQ item's project belongs to the user's company
  const existing = await prisma.boqItem.findFirst({
    where: { id, project: { companyId: company.id }, ...await scopeWhere("BoqItem") },
    select: { id: true },
  });
  if (!existing) return json({ error: "BOQ item not found" }, { status: 404 });
  try {
    await deleteBoqItem(id, user.id);
    revalidatePath("/boq");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof ServiceError ? err.message : "Failed to delete BOQ item" }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});
