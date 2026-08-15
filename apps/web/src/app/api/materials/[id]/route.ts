import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, logAction, extractVersion, ConcurrentEditError } from "@nirman/services";
import { apiHandler, json, materialSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const expectedVersion = extractVersion(body);
  const parsed = materialSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Material is a global catalog entity (no companyId) — verify it exists and isn't deleted.
  // Access is gated by requirePermission(PERM.INVENTORY_MANAGE).
  const existing = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return json({ error: "Material not found" }, { status: 404 });
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
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Optimistic locking: check version if provided
      if (expectedVersion !== undefined) {
        const current = await tx.material.findUnique({ where: { id }, select: { version: true } });
        if (!current) return json({ error: "Material not found" }, { status: 404 });
        if (current.version !== expectedVersion) {
          throw new ConcurrentEditError("Material", id, expectedVersion, current.version);
        }
      }
      const mat = await tx.material.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
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
  } catch (err) {
    if (err instanceof ConcurrentEditError) {
      return json({ error: err.message, code: "CONCURRENT_EDIT" }, { status: 409 });
    }
    throw err;
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  // Material is a global catalog entity — verify it exists and isn't deleted.
  const existing = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return json({ error: "Material not found" }, { status: 404 });
  }
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
