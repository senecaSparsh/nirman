import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { generateMaterialCode, logAction, lookupGstByHsn, suggestHsnByMaterial } from "@nirman/services";
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
    take: 200,
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
      version: m.version,
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

  // ── Auto-generate material code if not provided ──
  // Format: {CATEGORY_PREFIX}-{GRADE}-{SEQ} (e.g. STL-Fe500D-001)
  let code = parsed.data.code;
  if (!code || code.trim() === "AUTO") {
    const category = await prisma.materialCategory.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return json({ error: "Category not found" }, { status: 400 });
    code = await generateMaterialCode(category.name, parsed.data.grade ?? null);
  }

  // ── Auto-fill HSN/GST from government master if not provided ──
  let hsnCode = parsed.data.hsnCode;
  let gstRate = parsed.data.gstRate;

  // If HSN is provided but GST is 0, look up GST from the HSN master
  if (hsnCode && toNum(gstRate) === 0) {
    const hsnEntry = await lookupGstByHsn(hsnCode);
    if (hsnEntry) {
      gstRate = hsnEntry.gstRate.toNumber();
    }
  }

  // If neither HSN nor GST is provided, try to suggest from material name + category
  if (!hsnCode && toNum(gstRate) === 0) {
    const category = await prisma.materialCategory.findUnique({ where: { id: parsed.data.categoryId } });
    const suggestions = await suggestHsnByMaterial(parsed.data.name, category?.name);
    if (suggestions.length > 0) {
      hsnCode = suggestions[0]!.hsnCode;
      gstRate = suggestions[0]!.gstRate.toNumber();
    }
  }

  const existing = await prisma.material.findUnique({ where: { code } });
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
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Validate category exists
      const category = await tx.materialCategory.findUnique({ where: { id: parsed.data.categoryId } });
      if (!category) throw new Error("Category not found");

      const mat = await tx.material.create({
        data: {
          ...parsed.data,
          code,
          hsnCode,
          gstRate,
          currentCost: parsed.data.standardCost,
        },
      });
      await logAction(tx, {
        userId: user.id,
        action: "MATERIAL_CREATE",
        entityType: "Material",
        entityId: mat.id,
        after: { code: mat.code, name: mat.name, unit: mat.unit, standardCost: mat.standardCost.toString(), hsnCode: hsnCode ?? null, gstRate: gstRate.toString() },
      });
      return mat;
    });
    return json(created, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create material") }, { status: 400 });
  }
});

// ── Bulk CSV import ─────────────────────────────────────────────
// POST /api/materials with { bulk: true, items: [...] } creates
// multiple materials in one transaction. Skips duplicates (by code)
// and returns a summary of created/skipped/failed items.

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const items: unknown = body.items;
  if (!Array.isArray(items)) {
    return json({ error: "Expected { items: [...] } array" }, { status: 400 });
  }

  const results = { created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = materialSchema.safeParse(item);
    if (!parsed.success) {
      results.errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }
    const existing = await prisma.material.findUnique({ where: { code: parsed.data.code } });
    if (existing && !existing.deletedAt) {
      results.skipped++;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        if (existing && existing.deletedAt) {
          // Restore soft-deleted material
          await tx.material.update({
            where: { id: existing.id },
            data: { ...parsed.data, deletedAt: null },
          });
          await logAction(tx, {
            userId: user.id,
            action: "MATERIAL_RESTORE",
            entityType: "Material",
            entityId: existing.id,
            after: { code: parsed.data.code, name: parsed.data.name },
          });
        } else {
          const mat = await tx.material.create({
            data: { ...parsed.data, currentCost: parsed.data.standardCost },
          });
          await logAction(tx, {
            userId: user.id,
            action: "MATERIAL_CREATE",
            entityType: "Material",
            entityId: mat.id,
            after: { code: mat.code, name: mat.name },
          });
        }
      });
      results.created++;
    } catch (err) {
      results.errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Database error",
      });
    }
  }

  return json(results, { status: 200 });
});
