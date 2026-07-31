import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, materialSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();

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
        where: { location: { deletedAt: null } },
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
      description: m.description,
      totalQty,
      totalValue,
      lowStock,
    };
  });

  return json(rows);
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.material.findUnique({ where: { code: parsed.data.code } });
  if (existing && existing.deletedAt) {
    const restored = await prisma.material.update({
      where: { id: existing.id },
      data: { ...parsed.data, deletedAt: null },
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A material with this code already exists" }, { status: 409 });
  }
  const created = await prisma.material.create({
    data: {
      ...parsed.data,
      currentCost: parsed.data.standardCost,
    },
  });
  return json(created, { status: 201 });
});
