import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { MobileStockMovementsList } from "./MobileStockMovementsList";
import { MobileLocationDetail } from "./MobileLocationDetail";

export default function MobileStockPage({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string; locationId?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileStockContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileStockContent({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string; locationId?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { materialId, locationId } = await searchParams;

  // ── Location detail view: when locationId is set (and no materialId) ──
  // Different mental model: "what's at this location?" not "company ledger filtered"
  if (locationId && !materialId) {
    const [location, locationItems, movements] = await Promise.all([
      prisma.stockLocation.findUnique({
        where: { id: locationId },
        select: { id: true, name: true, type: true },
      }),
      prisma.stockLocationItem.findMany({
        where: { locationId, qty: { not: 0 } },
        include: { material: { select: { id: true, name: true, code: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      }),
      prisma.stockMovement.findMany({
        where: { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] },
        orderBy: { timestamp: "desc" },
        take: 50,
        include: {
          material: { select: { id: true, name: true, unit: true } },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!location) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Location not found
          </p>
        </div>
      );
    }

    const totalValue = locationItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);

    return (
      <MobileLocationDetail
        locationName={location.name}
        locationType={location.type}
        items={locationItems.map((i) => ({
          materialId: i.material.id,
          materialName: i.material.name,
          materialCode: i.material.code,
          unit: i.material.unit,
          qty: toNum(i.qty),
          mac: toNum(i.movingAvgCost),
        }))}
        movements={movements.map((m) => ({
          id: m.id,
          movementType: m.movementType,
          materialId: m.material.id,
          materialName: m.material.name,
          materialUnit: m.material.unit,
          qty: toNum(m.qty),
          fromLocationName: m.fromLocation?.name ?? null,
          toLocationName: m.toLocation?.name ?? null,
          timestamp: m.timestamp.toISOString(),
        }))}
        totalValue={totalValue}
      />
    );
  }

  // ── Company-wide ledger view (default) ──
  const [locations, movements, filterMaterial, materialStockItems] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: {
        ...(materialId ? { materialId } : {}),
        OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }],
      },
      orderBy: { timestamp: "desc" },
      take: 80,
      include: {
        material: { select: { id: true, name: true, unit: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
      },
    }),
    materialId
      ? prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, name: true, unit: true, code: true },
        })
      : null,
    materialId
      ? prisma.stockLocationItem.findMany({
          where: { materialId, qty: { not: 0 } },
          include: { location: { select: { id: true, name: true } } },
          orderBy: { location: { name: "asc" } },
        })
      : [],
  ]);

  const totalInventoryValue = locations.reduce(
    (s, l) => s + l.stockItems.reduce((ls, i) => ls + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    0,
  );

  const serializedLocations = locations.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    itemCount: l.stockItems.length,
    totalQty: l.stockItems.reduce((s, i) => s + toNum(i.qty), 0),
    totalValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
  }));

  const serializedMovements = movements.map((m) => ({
    id: m.id,
    movementType: m.movementType,
    materialId: m.material.id,
    materialName: m.material.name,
    materialUnit: m.material.unit,
    qty: toNum(m.qty),
    fromLocationId: m.fromLocation?.id ?? null,
    fromLocationName: m.fromLocation?.name ?? null,
    toLocationId: m.toLocation?.id ?? null,
    toLocationName: m.toLocation?.name ?? null,
    timestamp: m.timestamp.toISOString(),
  }));

  const serializedMaterialStock = materialStockItems.map((i) => ({
    locationId: i.location.id,
    locationName: i.location.name,
    qty: toNum(i.qty),
    unit: filterMaterial?.unit ?? "",
  }));

  return (
    <MobileStockMovementsList
      locations={serializedLocations}
      movements={serializedMovements}
      totalInventoryValue={totalInventoryValue}
      filterMaterialName={filterMaterial?.name ?? null}
      materialStockItems={serializedMaterialStock}
    />
  );
}
