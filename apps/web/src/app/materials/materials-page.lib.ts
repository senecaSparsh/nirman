/**
 * Pure row-transformation helpers extracted from the Materials page.
 *
 * These functions take raw Prisma query results and map them to the
 * client-serializable row shapes the MaterialsView component expects.
 * Extracted so they can be unit-tested without rendering the page.
 */
import { toNum } from "@/lib/server";
import type { MaterialCategory, MaterialRow, LowStockRow } from "@/lib/types";

/** Raw material row as returned by prisma.material.findMany with includes. */
interface RawMaterial {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  specification: string | null;
  categoryId: string;
  unit: string;
  hsnCode: string | null;
  gstRate: unknown;
  standardCost: unknown;
  minStock: unknown | null;
  reorderPoint: unknown | null;
  economicOrderQty: unknown | null;
  volumetricDensity: unknown | null;
  bulkDiscountPct: unknown | null;
  isCorporateCommodity: boolean | null;
  isLotTracked: boolean | null;
  isScrap: boolean | null;
  baseUnit: string | null;
  secondaryUnit: string | null;
  uomConversionFactor: unknown | null;
  description: string | null;
  category: { id: string; name: string; unit: string };
  stockItems: Array<{ qty: unknown; movingAvgCost: unknown }>;
}

/** Raw category row as returned by prisma.materialCategory.findMany with _count. */
interface RawCategory {
  id: string;
  name: string;
  unit: string;
  class: string | null;
  _count: { materials: number };
}

/** Map a raw Prisma material (with includes) to the MaterialRow API shape. */
export function mapMaterialRow(m: RawMaterial): MaterialRow {
  const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
  const totalValue = m.stockItems.reduce(
    (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
    0,
  );
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
    baseUnit: m.baseUnit as string,
    secondaryUnit: m.secondaryUnit,
    uomConversionFactor: m.uomConversionFactor == null ? null : toNum(m.uomConversionFactor),
    description: m.description,
    totalQty,
    totalValue,
    lowStock: m.minStock != null && totalQty < toNum(m.minStock),
  };
}

/** Map raw Prisma categories to the MaterialCategory shape. */
export function mapCategoryRow(c: RawCategory): MaterialCategory {
  return {
    id: c.id,
    name: c.name,
    unit: c.unit,
    class: c.class as string | undefined,
    _count: { materials: c._count.materials },
  };
}

/**
 * Build the low-stock rows from raw materials that have a minStock set.
 * Filters to only those actually below min, sorted by shortfall (desc).
 */
export function buildLowStockRows(
  materials: Array<{
    id: string;
    code: string;
    name: string;
    category: { name: string };
    unit: string;
    minStock: unknown;
    standardCost: unknown;
    stockItems: Array<{ qty: unknown }>;
  }>,
): LowStockRow[] {
  return materials
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = toNum(m.minStock);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        categoryName: m.category.name,
        unit: m.unit,
        totalQty,
        minStock,
        shortfall: minStock - totalQty,
        standardCost: toNum(m.standardCost),
      };
    })
    .filter((r) => r.totalQty < r.minStock)
    .sort((a, b) => b.shortfall - a.shortfall);
}

/** Sum the totalValue of all material rows → total stock value. */
export function computeStockValue(rows: MaterialRow[]): number {
  return rows.reduce((s, m) => s + m.totalValue, 0);
}
