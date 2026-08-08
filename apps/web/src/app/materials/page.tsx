import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { MaterialsView } from "@/components/materials/materials-view";
import { PageLoading } from "@/components/page-loading";
import type { MaterialCategory, MaterialRow, LowStockRow } from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function MaterialsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading materials…" variant="cards" />}>
        <MaterialsContent />
      </Suspense>
    </div>
  );
}

async function MaterialsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return (
      <NoAccess what="the material catalogue" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.INVENTORY_MANAGE),
    canEdit: hasPermission(role, PERM.INVENTORY_MANAGE),
    canDelete: hasPermission(role, PERM.INVENTORY_MANAGE),
  };

  const [categories, materials, lowStockMaterials] = await Promise.all([
    // Global entity — shared across companies (no companyId on MaterialCategory).
    prisma.materialCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
    }),
    // Global catalog entity (no companyId); stock scoped per company via stockItems.
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true, unit: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id } },
          select: { qty: true, movingAvgCost: true },
        },
      },
    }),
    // Global catalog entity; stock scoped per company via stockItems.
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      include: {
        category: { select: { name: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id } },
          select: { qty: true },
        },
      },
    }),
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
      lowStock: m.minStock != null && totalQty < toNum(m.minStock),
    };
  });

  const categoryRows: MaterialCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
    _count: { materials: c._count.materials },
  }));

  const lowStockRows: LowStockRow[] = lowStockMaterials
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

  const stockValue = materialRows.reduce((s, m) => s + m.totalValue, 0);

  return (
    <>
      <PageHeader
        title="Materials"
        description="The material catalogue — every item you buy, its unit, reorder level and current cost. Stock levels and movements live in Stock; locations and cost centres live in Settings."
        stats={[
          { label: "Materials", value: materialRows.length },
          { label: "Stock value", value: formatCurrency(stockValue) },
          { label: "Low stock", value: lowStockRows.length },
        ]}
      />
      <MaterialsView
        materials={materialRows}
        categories={categoryRows}
        lowStock={lowStockRows}
        permissions={perms}
      />
    </>
  );
}
