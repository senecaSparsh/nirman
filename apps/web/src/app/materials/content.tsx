import { connection } from "next/server";
import { prisma, Prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions, scopeWhere, getUserScope, getAssignedProjectIds } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { MaterialsView } from "@/components/materials/materials-view";
import type { MaterialCategory, MaterialRow, LowStockRow } from "@/lib/types";
import { NoAccess } from "@/components/no-access";

export async function MaterialsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.INVENTORY_VIEW)) {
    return (
      <NoAccess what="the material catalogue" permission={PERM.INVENTORY_VIEW} />
    );
  }

  const perms = {
    canCreate: __effPerms.includes(PERM.INVENTORY_MANAGE),
    canEdit: __effPerms.includes(PERM.INVENTORY_MANAGE),
    canDelete: __effPerms.includes(PERM.INVENTORY_MANAGE),
  };

  const cappedLabels: string[] = [];
  const capQ = (label: string, cap = LIST_CAP) => <T,>(rows: T[]): T[] => {
    const r = applyCap(rows, cap);
    if (r.capped) cappedLabels.push(label);
    return r.rows;
  };
  const [categories, materials, lowStockMaterials, suppliers] = await Promise.all([
    // Company-scoped entity (MaterialCategory.companyId).
    prisma.materialCategory.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
    }).then(capQ("categories")),
    prisma.material.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true, unit: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id }, ...(await scopeWhere("StockLocationItem")) },
          select: { qty: true, movingAvgCost: true },
        },
      },
    }).then(capQ("materials")),
    prisma.material.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id, deletedAt: null, reorderPoint: { not: null } },
      include: {
        category: { select: { name: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id }, ...(await scopeWhere("StockLocationItem")) },
          select: { qty: true },
        },
      },
    }).then(capQ("low-stock materials")),
    prisma.supplier.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }).then(capQ("suppliers", 200)),
  ]);

  // Header stats need complete aggregates — both lists above are capped.
  // Stock value (qty × movingAvgCost) can't be expressed in prisma.aggregate,
  // and low-stock needs a per-material SUM(qty) <= reorderPoint comparison, so both
  // run as raw SQL with the same location scoping the list queries use.
  const scope = await getUserScope();
  let locScope: Prisma.Sql;
  if (scope.scopeType === "PROJECT") {
    const ids = (await getAssignedProjectIds()) ?? [];
    locScope = ids.length
      ? Prisma.sql`AND l."projectId" IN (${Prisma.join(ids)})`
      : Prisma.sql`AND false`;
  } else if (scope.scopeType === "DEPARTMENT") {
    locScope = scope.departmentIds.length
      ? Prisma.sql`AND l."departmentId" IN (${Prisma.join(scope.departmentIds)})`
      : Prisma.sql`AND false`;
  } else {
    locScope = Prisma.empty;
  }

  const [materialCount, stockAgg, lowStockAgg] = await Promise.all([
    prisma.material.count({ where: { companyId: company.id, deletedAt: null } }),
    prisma.$queryRaw<{ stock_value: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(si.qty * si."movingAvgCost"), 0)::float AS stock_value
      FROM "StockLocationItem" si
      JOIN "StockLocation" l ON l.id = si."locationId"
      JOIN "Material" m ON m.id = si."materialId"
      WHERE m."companyId" = ${company.id} AND m."deletedAt" IS NULL
        AND l."companyId" = ${company.id} AND l."deletedAt" IS NULL
        ${locScope}
    `),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "Material" m
      WHERE m."companyId" = ${company.id} AND m."deletedAt" IS NULL
        AND m."reorderPoint" IS NOT NULL
        AND COALESCE((
          SELECT SUM(si.qty) FROM "StockLocationItem" si
          JOIN "StockLocation" l ON l.id = si."locationId"
          WHERE si."materialId" = m.id
            AND l."companyId" = ${company.id} AND l."deletedAt" IS NULL
            ${locScope}
        ), 0) <= m."reorderPoint"
    `),
  ]);

  const materialRows: MaterialRow[] = materials.map((m) => {
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
      baseUnit: m.baseUnit,
      secondaryUnit: m.secondaryUnit,
      uomConversionFactor: m.uomConversionFactor == null ? null : toNum(m.uomConversionFactor),
      description: m.description,
      totalQty,
      totalValue,
      lowStock: m.reorderPoint != null && totalQty <= toNum(m.reorderPoint),
    };
  });

  const categoryRows: MaterialCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
    class: c.class,
    _count: { materials: c._count.materials },
  }));

  const lowStockRows: LowStockRow[] = lowStockMaterials
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const reorderPoint = toNum(m.reorderPoint);
      const minStock = m.minStock == null ? null : toNum(m.minStock);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        categoryName: m.category.name,
        unit: m.unit,
        totalQty,
        reorderPoint,
        minStock,
        critical: minStock != null && totalQty <= minStock,
        shortfall: reorderPoint - totalQty,
        standardCost: toNum(m.standardCost),
      };
    })
    .filter((r) => r.totalQty <= r.reorderPoint)
    .sort((a, b) => b.shortfall - a.shortfall);

  const stockValue = toNum(stockAgg[0]?.stock_value);

  return (
    <>
      <PageHeader
        title="Materials"
        description="The material catalogue — every item you buy, its unit, reorder level and current cost. Stock levels and movements live in Stock; locations and cost centres live in Settings."
        stats={[
          { label: "Materials", value: materialCount, hint: "Total material items in the catalogue, including those with zero stock." },
          { label: "Stock value", value: formatCurrency(stockValue), hint: "Total value of on-hand stock for this company, valued at moving average cost." },
          { label: "Low stock", value: lowStockAgg[0]?.n ?? 0, hint: "Materials at or below their reorder point — time to raise an indent." },
        ]}
      />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <MaterialsView
        materials={materialRows}
        categories={categoryRows}
        lowStock={lowStockRows}
        permissions={perms}
        suppliers={suppliers}
      />
    </>
  );
}
