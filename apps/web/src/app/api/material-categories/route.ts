import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, materialCategorySchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  // Global entity — shared across companies (no companyId on MaterialCategory).
  const categories = await prisma.materialCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
  });
  return json(categories);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const parsed = materialCategorySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.materialCategory.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing && existing.deletedAt) {
    const restored = await prisma.$transaction(async (tx) => {
      const cat = await tx.materialCategory.update({
        where: { id: existing.id },
        data: { deletedAt: null, unit: parsed.data.unit },
      });
      await logAction(tx, {
        userId: user.id,
        action: "MATERIAL_CATEGORY_RESTORE",
        entityType: "MaterialCategory",
        entityId: cat.id,
        after: { name: cat.name, unit: cat.unit },
      });
      return cat;
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A category with this name already exists" }, { status: 409 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const cat = await tx.materialCategory.create({ data: parsed.data });
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_CATEGORY_CREATE",
      entityType: "MaterialCategory",
      entityId: cat.id,
      after: { name: cat.name, unit: cat.unit },
    });
    return cat;
  });
  return json(created, { status: 201 });
});
