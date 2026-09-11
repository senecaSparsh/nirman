import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { generateMaterialCode, logAction, lookupGstByHsn, suggestHsnByMaterial, recordStockAdjustment } from "@nirman/services";
import { apiHandler, getCompany, json, materialSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

/**
 * Auto-fill HSN code and GST rate for a material.
 *
 * Priority:
 *   1. If HSN is provided but GST is 0 → look up GST from the HSN master.
 *   2. If HSN is not provided → use the category's stored default HSN/GST.
 *   3. If still no HSN → fuzzy-suggest from material name + category name.
 *
 * Used by both the single-material POST and the bulk-import PUT so they
 * stay consistent.
 */
async function autoFillHsnGst(
  parsed: { hsnCode?: string | null; gstRate?: number; categoryId: string; name: string },
  companyId: string,
): Promise<{ hsnCode: string | null; gstRate: number }> {
  let hsnCode = parsed.hsnCode ?? null;
  let gstRate = parsed.gstRate ?? 0;

  // If HSN is provided but GST is 0, look up GST from the HSN master
  if (hsnCode && toNum(gstRate) === 0) {
    const hsnEntry = await lookupGstByHsn(hsnCode);
    if (hsnEntry) {
      gstRate = hsnEntry.gstRate.toNumber();
    }
  }

  // If HSN is not provided, try the category's stored default HSN/GST first,
  // then fall back to fuzzy suggestion from material name + category name.
  if (!hsnCode) {
    const category = await prisma.materialCategory.findUnique({ where: { id: parsed.categoryId, companyId, deletedAt: null } });
    if (category?.hsnCode) {
      hsnCode = category.hsnCode;
      if (toNum(gstRate) === 0) {
        gstRate = category.gstRate != null ? category.gstRate.toNumber() : 0;
      }
    }
    if (!hsnCode) {
      const suggestions = await suggestHsnByMaterial(parsed.name, category?.name);
      if (suggestions.length > 0) {
        hsnCode = suggestions[0]!.hsnCode;
        if (toNum(gstRate) === 0) {
          gstRate = suggestions[0]!.gstRate.toNumber();
        }
      }
    }
  }

  return { hsnCode, gstRate };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

  // Material is company-scoped (Material.companyId). Filter directly so
  // cross-company materials are never exposed even if stockItems is empty.
  const where = {
    companyId: company.id,
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Fetch one extra row to detect truncation without a separate count query.
  const materials = await prisma.material.findMany({
    take: limit + 1,
    where,
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, unit: true } },
      stockItems: {
        where: { location: { deletedAt: null, companyId: company.id } },
        select: { qty: true, movingAvgCost: true },
      },
    },
  });

  const hasMore = materials.length > limit;
  const page = hasMore ? materials.slice(0, limit) : materials;

  const rows = page.map((m) => {
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
      grade: m.grade,
      specification: m.specification,
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
      isLotTracked: m.isLotTracked ?? false,
      isScrap: m.isScrap ?? false,
      baseUnit: m.baseUnit,
      secondaryUnit: m.secondaryUnit,
      uomConversionFactor: m.uomConversionFactor == null ? null : toNum(m.uomConversionFactor),
      description: m.description,
      version: m.version,
      totalQty,
      totalValue,
      lowStock,
    };
  });

  return json({ rows, hasMore, count: rows.length });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // ── Opening stock (optional) ──
  // If provided, the material is created AND stock is recorded in one action.
  const openingStock = body.openingStock as
    | { locationId?: string; qty?: number; unitCost?: number; reason?: string }
    | undefined;
  const hasOpeningStock =
    openingStock &&
    openingStock.locationId &&
    openingStock.qty &&
    Number(openingStock.qty) > 0;
  if (hasOpeningStock) {
    // Validate the location belongs to this company before we create anything
    const loc = await prisma.stockLocation.findFirst({
      where: { id: openingStock!.locationId!, companyId: company.id, deletedAt: null },
      select: { id: true },
    });
    if (!loc) {
      return json({ error: "Stock location not found in this company" }, { status: 400 });
    }
  }

  // ── Auto-generate material code if not provided ──
  // Format: {CATEGORY_PREFIX}-{GRADE}-{SEQ} (e.g. STL-Fe500D-001)
  let code = parsed.data.code;
  if (!code || code.trim() === "AUTO") {
    const category = await prisma.materialCategory.findUnique({ where: { id: parsed.data.categoryId, companyId: company.id, deletedAt: null } });
    if (!category) return json({ error: "Category not found" }, { status: 400 });
    code = await generateMaterialCode(category.name, parsed.data.grade ?? null);
  }

  // ── Auto-fill HSN/GST from government master if not provided ──
  const { hsnCode, gstRate } = await autoFillHsnGst(parsed.data, company.id);

  const existing = await prisma.material.findUnique({ where: { companyId_code: { companyId: company.id, code } } });
  if (existing && existing.deletedAt) {
    const restored = await withSerializableTransaction(async (tx) => {
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
    revalidatePath("/materials");
    revalidatePath("/m/materials");
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A material with this code already exists" }, { status: 409 });
  }
  try {
    const created = await withSerializableTransaction(async (tx) => {
      // Validate category exists and belongs to the active company
      const category = await tx.materialCategory.findUnique({ where: { id: parsed.data.categoryId, companyId: company.id, deletedAt: null } });
      if (!category) throw new Error("Category not found");

      const mat = await tx.material.create({
        data: {
          ...parsed.data,
          companyId: company.id,
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
    revalidatePath("/materials");
    revalidatePath("/m/materials");
    // ── Record opening stock if provided ──
    if (hasOpeningStock) {
      try {
        await recordStockAdjustment({
          materialId: created.id,
          locationId: openingStock!.locationId!,
          direction: "IN",
          qty: Number(openingStock!.qty),
          unitCost: openingStock!.unitCost != null ? String(openingStock!.unitCost) : null,
          reason: openingStock!.reason?.trim() || "Opening stock entry",
          userId: user.id,
        });
        revalidatePath(`/materials/${created.id}`);
        revalidatePath(`/m/materials/${created.id}`);
        revalidatePath("/stock");
        revalidatePath("/m/stock");
      } catch (err: unknown) {
        // Material was created successfully — don't fail the whole request.
        // Log the stock error but return the material.
        console.error("Opening stock failed:", err instanceof Error ? err.message : err);
      }
    }
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
  const company = await getCompany();
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
    const existing = await prisma.material.findUnique({ where: { companyId_code: { companyId: company.id, code: parsed.data.code } } });
    if (existing && !existing.deletedAt) {
      results.skipped++;
      continue;
    }
    try {
      // Auto-fill HSN/GST from category / HSN master (same as single POST)
      const { hsnCode, gstRate } = await autoFillHsnGst(parsed.data, company.id);
      const dataWithHsn = { ...parsed.data, hsnCode, gstRate };

      await withSerializableTransaction(async (tx) => {
        if (existing && existing.deletedAt) {
          // Restore soft-deleted material
          await tx.material.update({
            where: { id: existing.id },
            data: { ...dataWithHsn, deletedAt: null },
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
            data: { ...dataWithHsn, companyId: company.id, currentCost: parsed.data.standardCost },
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

  revalidatePath("/materials");
  revalidatePath("/m/materials");
  return json(results, { status: 200 });
});
