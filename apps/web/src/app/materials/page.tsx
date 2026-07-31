import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { MaterialsView } from "@/components/materials/materials-view";
import { PageLoading } from "@/components/page-loading";
import type { MaterialCategory, MaterialRow, ProjectOption, StockLocationRow, StockRow, LowStockRow } from "@/lib/types";

export default function MaterialsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Materials"
        description="Manage materials, categories, stock levels, and low-stock alerts across all locations."
      />
      <Suspense fallback={<PageLoading label="Loading materials…" />}>
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
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.INVENTORY_MANAGE),
    canEdit: hasPermission(role, PERM.INVENTORY_MANAGE),
    canDelete: hasPermission(role, PERM.INVENTORY_MANAGE),
  };

  const [categories, materials, locations, stockItems, projects, lowStockMaterials] =
    await Promise.all([
      prisma.materialCategory.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
      }),
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
      prisma.stockLocation.findMany({
        where: { companyId: company.id, deletedAt: null },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        include: {
          project: { select: { id: true, name: true } },
          stockItems: { select: { qty: true, movingAvgCost: true } },
        },
      }),
      prisma.stockLocationItem.findMany({
        where: {
          qty: { gt: 0 },
          location: { deletedAt: null, companyId: company.id },
          material: { deletedAt: null },
        },
        include: {
          location: { select: { id: true, name: true, type: true } },
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: [{ material: { name: "asc" } }, { location: { name: "asc" } }],
      }),
      prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, status: true },
      }),
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

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
  }));

  const stockRows: StockRow[] = stockItems.map((i) => ({
    id: i.id,
    locationId: i.location.id,
    locationName: i.location.name,
    locationType: i.location.type,
    materialId: i.material.id,
    materialCode: i.material.code,
    materialName: i.material.name,
    categoryName: i.material.category.name,
    unit: i.material.unit,
    qty: toNum(i.qty),
    mac: toNum(i.movingAvgCost),
    value: toNum(i.qty) * toNum(i.movingAvgCost),
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
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

  return (
    <MaterialsView
      materials={materialRows}
      categories={categoryRows}
      locations={locationRows}
      stock={stockRows}
      lowStock={lowStockRows}
      projects={projectRows}
      permissions={perms}
    />
  );
}
