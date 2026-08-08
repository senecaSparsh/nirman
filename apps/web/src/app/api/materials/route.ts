import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, materialSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();

  // Material is a global catalog entity (no companyId); stock is scoped per
  // company via the stockItems relation → StockLocation.companyId.
  const materials = await prisma.material.findMany({
    where: {
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, unit: true } },
      stockItems: {
        where: { location: { deletedAt: null, companyId: company.id } },
        select: { qty: true, movingAvgCost: true },
      },
    },
  });

  const rows = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = m.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    const lowStock = m.minStock != null && totalQty < toNum(m.minStock);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      categoryId: m.categoryId,
      categoryName: m.category.name,
      unit: m.unit,
      hsnCode: m.hsnCode,
      gstRate: toNum(m.gstRate),
      standardCost: toNum(m.standardCost),
      minStock: m.minStock == null ? null : toNum(m.minStock),
      reorderPoint: m.reorderPoint == null ? null : toNum(m.reorderPoint),
      economicOrderQty: m.economicOrderQty == null ? null : toNum(m.economicOrderQty),
      volumetricDensity: m.volumetricDensity == null ? null : toNum(m.volumetricDensity),
      bulkDiscountPct: m.bulkDiscountPct == null ? null : toNum(m.bulkDiscountPct),
      isCorporateCommodity: m.isCorporateCommodity ?? false,
      description: m.description,
      totalQty,
      totalValue,
      lowStock,
    };
  });

  return json(rows);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.material.findUnique({ where: { code: parsed.data.code } });
  if (existing && existing.deletedAt) {
    const restored = await prisma.$transaction(async (tx) => {
      const mat = await tx.material.update({
        where: { id: existing.id },
        data: { ...parsed.data, deletedAt: null },
      });
      await logAction(tx, {
        userId: user.id,
        action: "MATERIAL_RESTORE",
        entityType: "Material",
        entityId: mat.id,
        after: { code: mat.code, name: mat.name, unit: mat.unit },
      });
      return mat;
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A material with this code already exists" }, { status: 409 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const mat = await tx.material.create({
      data: {
        ...parsed.data,
        currentCost: parsed.data.standardCost,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_CREATE",
      entityType: "Material",
      entityId: mat.id,
      after: { code: mat.code, name: mat.name, unit: mat.unit, standardCost: mat.standardCost.toString() },
    });
    return mat;
  });
  return json(created, { status: 201 });
});
