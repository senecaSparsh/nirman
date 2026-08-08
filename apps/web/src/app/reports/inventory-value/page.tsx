import { Suspense } from "react";
import { connection } from "next/server";
import { prisma, type StockMovementType } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { InventoryValueReport } from "@/components/reports/inventory-value-report";

import { NoAccess } from "@/components/no-access";

/**
 * Inventory Value report — stock value (qty × MAC) by location and category.
 *
 * By default shows the LIVE current balance (from StockLocationItem).
 * When `?asOn=YYYY-MM-DD` is provided, reconstructs the historical balance
 * by replaying the StockMovement ledger up to that date — matching the
 * client's paper "Saleable Stock Report (Closing As On : ...)" format.
 */
export default function InventoryValuePage({
  searchParams,
}: {
  searchParams: Promise<{ asOn?: string }>;
}) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading inventory value…" variant="cards" />}>
        <InventoryValueContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InventoryValueContent({
  searchParams,
}: {
  searchParams: Promise<{ asOn?: string }>;
}) {
  await connection();
  const { asOn: asOnParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="the inventory value report" />;
  }

  const asOnDate = asOnParam ? new Date(asOnParam) : null;
  const isHistorical = asOnDate !== null;
  if (isHistorical) asOnDate!.setHours(23, 59, 59, 999);

  // ── Build the items list ──
  // For live mode: read StockLocationItem directly (fast, current).
  // For historical mode: replay StockMovement ledger up to as-on-date.
  type ItemRow = {
    locationId: string;
    locationName: string;
    locationType: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    materialUnit: string;
    categoryId: string;
    categoryName: string;
    qty: number;
    value: number;
  };

  let items: ItemRow[] = [];

  if (!isHistorical) {
    // ── Live mode: read current balances ──
    const liveItems = await prisma.stockLocationItem.findMany({
      where: {
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
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    items = liveItems.map((item) => ({
      locationId: item.location.id,
      locationName: item.location.name,
      locationType: item.location.type,
      materialId: item.material.id,
      materialCode: item.material.code,
      materialName: item.material.name,
      materialUnit: item.material.unit,
      categoryId: item.material.category.id,
      categoryName: item.material.category.name,
      qty: toNum(item.qty),
      value: toNum(item.qty) * toNum(item.movingAvgCost),
    }));
  } else {
    // ── Historical mode: replay movement ledger ──
    // For each (material, location), find the last movement up to as-on-date
    // and read its balanceAfter (qty) and balanceValueAfter (value).
    const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN"];
    const OUT_TYPES: StockMovementType[] = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];

    const [inMovements, outMovements, locations, materials] = await Promise.all([
      prisma.stockMovement.findMany({
        where: {
          movementType: { in: IN_TYPES },
          toLocation: { companyId: company.id, deletedAt: null },
          timestamp: { lte: asOnDate! },
        },
        include: {
          material: {
            select: {
              id: true, code: true, name: true, unit: true,
              category: { select: { id: true, name: true } },
            },
          },
          toLocation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { timestamp: "desc" },
      }),
      prisma.stockMovement.findMany({
        where: {
          movementType: { in: OUT_TYPES },
          fromLocation: { companyId: company.id, deletedAt: null },
          timestamp: { lte: asOnDate! },
        },
        include: {
          material: {
            select: {
              id: true, code: true, name: true, unit: true,
              category: { select: { id: true, name: true } },
            },
          },
          fromLocation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { timestamp: "desc" },
      }),
      prisma.stockLocation.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, name: true, type: true },
      }),
      prisma.material.findMany({
        where: { deletedAt: null },
        select: {
          id: true, code: true, name: true, unit: true,
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Build a lookup: for each (materialId, locationId), the last movement's balance
    const lastBalance = new Map<string, { qty: number; value: number }>();

    for (const m of inMovements) {
      const key = `${m.materialId}:${m.toLocationId}`;
      if (!lastBalance.has(key)) {
        lastBalance.set(key, { qty: toNum(m.balanceAfter), value: toNum(m.balanceValueAfter) });
      }
    }
    for (const m of outMovements) {
      const key = `${m.materialId}:${m.fromLocationId}`;
      if (!lastBalance.has(key)) {
        lastBalance.set(key, { qty: toNum(m.balanceAfter), value: toNum(m.balanceValueAfter) });
      }
    }

    const locMap = new Map(locations.map((l) => [l.id, l]));
    const matMap = new Map(materials.map((m) => [m.id, m]));

    for (const [key, bal] of lastBalance) {
      if (bal.qty <= 0 && bal.value <= 0) continue; // skip empty
      const parts = key.split(":");
      const materialId = parts[0]!;
      const locationId = parts[1]!;
      const loc = locMap.get(locationId);
      const mat = matMap.get(materialId);
      if (!loc || !mat) continue;
      items.push({
        locationId: loc.id,
        locationName: loc.name,
        locationType: loc.type,
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        materialUnit: mat.unit,
        categoryId: mat.category.id,
        categoryName: mat.category.name,
        qty: bal.qty,
        value: bal.value,
      });
    }
  }

  // Aggregate by location
  const byLocation = new Map<string, { name: string; type: string; value: number; qty: number }>();
  // Aggregate by category
  const byCategory = new Map<string, { name: string; value: number; qty: number }>();
  // Top materials by value
  const materialTotals = new Map<string, { code: string; name: string; unit: string; categoryName: string; value: number; qty: number }>();

  let grandTotal = 0;
  let totalQty = 0;

  for (const item of items) {
    const qty = item.qty;
    const value = item.value;
    grandTotal += value;
    totalQty += qty;

    if (!byLocation.has(item.locationId)) {
      byLocation.set(item.locationId, { name: item.locationName, type: item.locationType, value: 0, qty: 0 });
    }
    const locRow = byLocation.get(item.locationId)!;
    locRow.value += value;
    locRow.qty += qty;

    if (!byCategory.has(item.categoryId)) {
      byCategory.set(item.categoryId, { name: item.categoryName, value: 0, qty: 0 });
    }
    const catRow = byCategory.get(item.categoryId)!;
    catRow.value += value;
    catRow.qty += qty;

    if (!materialTotals.has(item.materialId)) {
      materialTotals.set(item.materialId, {
        code: item.materialCode,
        name: item.materialName,
        unit: item.materialUnit,
        categoryName: item.categoryName,
        value: 0,
        qty: 0,
      });
    }
    const matRow = materialTotals.get(item.materialId)!;
    matRow.value += value;
    matRow.qty += qty;
  }

  const locationRows = Array.from(byLocation.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.value - a.value);
  const categoryRows = Array.from(byCategory.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.value - a.value);
  const topMaterials = Array.from(materialTotals.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const asOnLabel = isHistorical ? ` as on ${asOnParam}` : "";

  return (
    <>
      <PageHeader
        title={`Inventory Value${isHistorical ? " (Historical)" : ""}`}
        description={
          isHistorical
            ? `Stock value as on ${asOnParam}, reconstructed from the movement ledger. Matches the paper "Saleable Stock Report (Closing As On)" format.`
            : "Stock value (qty × moving-average cost) by location and material category — where your material capital is parked."
        }
        stats={[
          { label: `Total value${asOnLabel}`, value: formatCurrency(grandTotal) },
          { label: "Locations", value: locationRows.length },
          { label: "Categories", value: categoryRows.length },
          { label: "Line items", value: items.length },
        ]}
      />
      <InventoryValueReport
        locations={locationRows}
        categories={categoryRows}
        topMaterials={topMaterials}
        grandTotal={grandTotal}
        totalQty={totalQty}
        asOnDate={asOnParam}
      />
    </>
  );
}
