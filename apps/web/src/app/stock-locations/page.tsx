import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { StockLocationsView } from "@/components/stock-locations/stock-locations-view";

export const metadata = { title: "Stock Locations" };

export default function StockLocationsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading stock locations…" variant="list" />}>
        <StockLocationsContent />
      </Suspense>
    </div>
  );
}

export async function StockLocationsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return (
      <NoAccess what="stock locations" />
    );
  }

  const perms = {
    canManage: hasPermission(role, PERM.INVENTORY_MANAGE),
  };

  const [locations, projects] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const locationRows = locations.map((l) => {
    const stockValue = l.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    return {
      id: l.id,
      type: l.type,
      name: l.name,
      address: l.address,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      lat: l.lat,
      lng: l.lng,
      geoRadius: l.geoRadius,
      itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
      stockValue,
    };
  });

  const totalStockValue = locationRows.reduce((s, l) => s + l.stockValue, 0);
  const warehouseCount = locationRows.filter((l) => l.type === "COMPANY_WAREHOUSE" || l.type === "CENTRAL_WAREHOUSE").length;
  const siteCount = locationRows.filter((l) => l.type === "PROJECT_SITE").length;

  return (
    <>
      <PageHeader
        title="Stock Locations"
        description="Where material is received, stored and issued from — warehouses, project sites and department stores, with on-hand counts and stock value at moving average cost."
        stats={[
          { label: "Locations", value: locationRows.length, hint: "Total active stock locations for this company." },
          { label: "Warehouses", value: warehouseCount, hint: "Company and central warehouses that distribute to project sites." },
          { label: "Project Sites", value: siteCount, hint: "On-site stores linked to a specific project." },
          { label: "Stock Value", value: formatCurrency(totalStockValue), hint: "Total value of on-hand stock across all locations, valued at moving average cost." },
        ]}
      />
      <StockLocationsView
        locations={locationRows}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        permissions={perms}
      />
    </>
  );
}
