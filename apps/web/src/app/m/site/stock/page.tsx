import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, ScanLine } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileSiteStockList } from "./MobileSiteStockList";

/** Field → Stock tab: stock by location + recent movements. */
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
          select: { qty: true, material: { select: { name: true } } },
        },
      },
      take: 30,
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }] },
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { material: { select: { name: true, unit: true } }, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
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
      materialNames: l.stockItems.map((i) => i.material.name),
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

  return (
    <div>
      <MobilePageHeader
        title="Stock"
        subtitle={`${locations.length} locations`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Locations" value={formatNumber(locations.length, 0)} icon={Package} />
        <MobileStatCard label="Total Items" value={formatNumber(totalItems, 0)} icon={Package} />
        <MobileStatCard label="Total Units" value={formatNumber(totalUnits, 0)} icon={Package} />
      </div>

      <div className="px-4 pb-2">
        <MobileCta href="/m/stock" icon={ScanLine} variant="outline">
          Stock ledger
        </MobileCta>
      </div>

      <MobileSiteStockList locations={serializedLocations} movements={serializedMovements} />

      {locations.length === 0 && recentMovements.length === 0 && (
        <>
          <MobileSectionTitle>Locations</MobileSectionTitle>
          <MobileEmptyState icon={Package} title="No stock locations" />
        </>
      )}
    </div>
  );
}
