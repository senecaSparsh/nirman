import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, logAction } from "@nirman/services";
import { apiHandler, json, materialSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = materialSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If code is changing, ensure uniqueness among non-deleted materials
  if (parsed.data.code) {
    const clash = await prisma.material.findFirst({
      where: { code: parsed.data.code, deletedAt: null, NOT: { id } },
    });
    if (clash) {
      return json({ error: "A material with this code already exists" }, { status: 409 });
    }
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.standardCost != null) data.currentCost = parsed.data.standardCost;
  const updated = await prisma.$transaction(async (tx) => {
    const mat = await tx.material.update({ where: { id }, data });
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_UPDATE",
      entityType: "Material",
      entityId: id,
      after: { code: mat.code, name: mat.name, standardCost: mat.standardCost.toString() },
    });
    return mat;
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  await softDelete("Material", id);
  await prisma.$transaction(async (tx) => {
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_DELETE",
      entityType: "Material",
      entityId: id,
    });
  });
  return json({ ok: true });
});
