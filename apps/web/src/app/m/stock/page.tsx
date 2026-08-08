import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileInfoRow,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileStockMovementsList } from "./MobileStockMovementsList";

/**
 * /m/stock — mobile stock ledger.
 *
 * Replaces every desktop `/stock?tab=movements` link from the mobile surface.
 * Shows stock-on-hand by location (with MAC value) + the recent movement
 * audit feed. Supports `?materialId=` and `?locationId=` filters so a
 * material or location detail page can deep-link to its own movements.
 */
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

  const [locations, movements, filterMaterial, locationItems, materialStockItems] = await Promise.all([
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
        ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}),
        OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }],
      },
      orderBy: { timestamp: "desc" },
      take: 80,
      include: {
        material: { select: { id: true, name: true, unit: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
    materialId
      ? prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, name: true, unit: true, code: true },
        })
      : null,
    locationId
      ? prisma.stockLocationItem.findMany({
          where: { locationId, qty: { not: 0 } },
          include: { material: { select: { id: true, name: true, code: true, unit: true } } },
          orderBy: { material: { name: "asc" } },
        })
      : [],
    materialId
      ? prisma.stockLocationItem.findMany({
          where: { materialId, qty: { not: 0 } },
          include: { location: { select: { id: true, name: true } } },
          orderBy: { location: { name: "asc" } },
        })
      : [],
  ]);

  const locTypeLabel = (t: string) =>
    t === "COMPANY_WAREHOUSE" ? "Warehouse" : t === "PROJECT_SITE" ? "Site" : t === "DEPARTMENT" ? "Dept" : t;

  const totalInventoryValue = locations.reduce(
    (s, l) => s + l.stockItems.reduce((ls, i) => ls + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    0,
  );

  const movementIcon = (type: string) =>
    type === "PURCHASE_RECEIPT" || type === "TRANSFER_IN" || type === "ADJUSTMENT_IN" || type === "RETURN" || type === "SCRAP_GENERATED"
      ? ArrowDownToLine
      : type === "ISSUE_TO_PROJECT" || type === "ISSUE_TO_DEPARTMENT" || type === "ADJUSTMENT_OUT" || type === "SALE"
        ? ArrowUpFromLine
        : ArrowLeftRight;

  const movementTone = (type: string): "success" | "danger" | "default" =>
    type === "PURCHASE_RECEIPT" || type === "TRANSFER_IN" || type === "ADJUSTMENT_IN" || type === "RETURN" || type === "SCRAP_GENERATED"
      ? "success"
      : type === "ISSUE_TO_PROJECT" || type === "ISSUE_TO_DEPARTMENT" || type === "ADJUSTMENT_OUT" || type === "SALE"
        ? "danger"
        : "default";

  const movementLabel = (type: string) =>
    ({
      PURCHASE_RECEIPT: "Receipt",
      TRANSFER_IN: "Transfer In",
      TRANSFER_OUT: "Transfer Out",
      ISSUE_TO_PROJECT: "Issue → Project",
      ISSUE_TO_DEPARTMENT: "Issue → Dept",
      ADJUSTMENT_IN: "Adjustment +",
      ADJUSTMENT_OUT: "Adjustment −",
      RETURN: "Return",
      SALE: "Sale",
      SCRAP_GENERATED: "Scrap Gen",
    } as Record<string, string>)[type] ?? type.replace(/_/g, " ");

  // Serialize movements for the client search component
  const serializedMovements = movements.map((m) => ({
    id: m.id,
    movementType: m.movementType,
    materialId: m.material.id,
    materialName: m.material.name,
    materialUnit: m.material.unit,
    qty: toNum(m.qty),
    fromLocationName: m.fromLocation?.name ?? null,
    toLocationName: m.toLocation?.name ?? null,
    timestamp: m.timestamp.toISOString(),
  }));

  return (
    <div>
      <MobilePageHeader
        title={filterMaterial ? filterMaterial.name : "Stock Ledger"}
        subtitle={
          filterMaterial
            ? `${filterMaterial.code} · ${formatCurrency(totalInventoryValue)} on hand`
            : `${locations.length} locations · ${formatCurrency(totalInventoryValue)} on hand`
        }
        right={<MobileRefreshButton />}
      />

      {!materialId && !locationId && (
        <div className="grid grid-cols-2 gap-2 p-3">
          <MobileStatCard label="Locations" value={String(locations.length)} icon={Package} />
          <MobileStatCard label="Inventory Value" value={formatCurrency(totalInventoryValue)} icon={Package} tone="success" />
        </div>
      )}

      {/* ── Stock on hand by location ──────────────────────────── */}
      {!materialId && (
        <>
          <MobileSectionTitle>Stock on Hand</MobileSectionTitle>
          {locations.length === 0 ? (
            <MobileEmptyState icon={Package} title="No stock locations" hint="Set up locations in Setup" />
          ) : (
            <div>
              {locations.map((l) => {
                const qty = l.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
                const value = l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
                return (
                  <MobileRow
                    key={l.id}
                    href={`/m/stock?locationId=${l.id}`}
                    icon={Package}
                    title={l.name}
                    subtitle={`${locTypeLabel(l.type)} · ${l.stockItems.length} items`}
                    meta={formatCurrency(value)}
                    badge={qty > 0 ? `${formatNumber(qty, 0)}` : undefined}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Per-location stock items (when a location is selected) ── */}
      {locationId && (
        <>
          <MobileSectionTitle>Items at this Location</MobileSectionTitle>
          {locationItems.length === 0 ? (
            <MobileEmptyState icon={Package} title="No stock at this location" />
          ) : (
            <div>
              {locationItems.map((i) => (
                <MobileRow
                  key={i.id}
                  href={`/m/materials/${i.material.id}`}
                  icon={Package}
                  title={i.material.name}
                  subtitle={`${i.material.code} · MAC ${formatCurrency(toNum(i.movingAvgCost))}`}
                  meta={`${formatNumber(toNum(i.qty), 0)} ${i.material.unit}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Movement audit feed (with client-side search) ──────── */}
      <MobileStockMovementsList
        items={serializedMovements}
        movementIcon={movementIcon}
        movementTone={movementTone}
        movementLabel={movementLabel}
      />

      {/* ── Per-material stock summary (when filtering by material) ── */}
      {materialId && filterMaterial && (
        <>
          <MobileSectionTitle>On Hand by Location</MobileSectionTitle>
          {materialStockItems.length === 0 ? (
            <MobileEmptyState icon={Package} title="None on hand" />
          ) : (
            <div>
              {materialStockItems.map((i) => (
                <MobileInfoRow
                  key={i.id}
                  icon={Package}
                  title={i.location.name}
                  value={`${formatNumber(toNum(i.qty), 0)} ${filterMaterial.unit}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
