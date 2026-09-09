import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, scopeWhere } from "@/lib/server";
import { MobileSiteStockList } from "./MobileSiteStockList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/** Field → Stock tab: physical inventory at each location + recent activity. */
export default function SiteStockPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <SiteStockContent />
    </Suspense>
  );
}

async function SiteStockContent() {
  await connection();
  const company = await getCompany();

  const [locations, recentMovements] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        stockItems: {
          select: {
            qty: true,
            material: { select: { id: true, name: true, unit: true } },
          },
          orderBy: { qty: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: {...await scopeWhere("StockMovement"),  OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }] },
      orderBy: { timestamp: "desc" },
      take: 5,
      include: {
        material: { select: { name: true, unit: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
  ]);

  const serializedLocations = locations.map((l) => {
    const totalQty = l.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    return {
      id: l.id,
      name: l.name,
      type: l.type,
      itemCount: l.stockItems.length,
      totalQty,
      items: l.stockItems.map((i) => ({
        materialId: i.material.id,
        materialName: i.material.name,
        unit: i.material.unit,
        qty: toNum(i.qty),
      })),
    };
  });

  const serializedMovements = recentMovements.map((m) => ({
    id: m.id,
    qty: toNum(m.qty),
    materialName: m.material.name,
    materialUnit: m.material.unit,
    fromLocationName: m.fromLocation?.name ?? null,
    toLocationName: m.toLocation?.name ?? null,
    movementType: m.movementType,
    timestamp: m.timestamp.toISOString(),
  }));

  const totalItems = locations.reduce((s, l) => s + l.stockItems.length, 0);
  const totalUnits = locations.reduce(
    (s, l) => s + l.stockItems.reduce((ss, i) => ss + toNum(i.qty), 0),
    0,
  );

  const exportColumns: MobileColumnSpec[] = [
    { key: "name", label: "Location" },
    { key: "type", label: "Type" },
    { key: "itemCount", label: "Items" },
    { key: "totalQty", label: "Total Qty" },
  ];

  return (
    <MobileSiteStockList
      locations={serializedLocations}
      movements={serializedMovements}
      totalItems={totalItems}
      totalUnits={totalUnits}
      exportTitle="Site Stock"
      exportRows={serializedLocations as unknown as Record<string, unknown>[]}
      exportColumns={exportColumns}
      exportSummary={`${serializedLocations.length} locations · ${totalItems} items`}
    />
  );
}
