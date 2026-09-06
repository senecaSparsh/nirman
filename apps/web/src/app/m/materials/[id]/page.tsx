import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Package, ArrowLeftRight,
  IndianRupee, ClipboardList,
} from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
  MobileNoAccess,
} from "@/components/mobile/v2/primitives";

import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileMaterialDeleteBtn } from "./MobileMaterialDeleteBtn";
import { MobileAdjustStockBtn } from "./MobileAdjustStockBtn";

/**
 * /m/materials/[id] — material detail page.
 *
 * Layout:
 *   1. Back button
 *   2. Hero card — material name, code, category, stock level bar
 *   3. Attention banner — low/out of stock alerts
 *   4. Overview + Details — 2-col grid
 *   5. Stock by location + Recent movements — 2-col side by side
 */
export default function MobileMaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileMaterialDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMaterialDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <MobileNoAccess what="material details" permission={PERM.INVENTORY_VIEW} />;
  }
  const { id } = await params;

  const [material, stockItems, movements, locationRows] = await Promise.all([
    prisma.material.findFirst({
      where: { id, deletedAt: null },
      include: { category: { select: { name: true } } },
    }),
    prisma.stockLocationItem.findMany({
      where: { materialId: id, location: { companyId: company.id } },
      include: { location: { select: { id: true, name: true, type: true } } },
      orderBy: { location: { name: "asc" } },
    }),
    prisma.stockMovement.findMany({
      where: {
        materialId: id,
        OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }],
      },
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
    }),

    // All company stock locations — passed to the adjust-stock sheet so the
    // location select is never empty, even when this material has zero stock.
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { project: { select: { id: true, name: true } } },
    }),
  ]);

  if (!material) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={Package} title="Material not found" />
      </div>
    );
  }

  const totalQty = stockItems.reduce((s, i) => s + toNum(i.qty), 0);
  const totalValue = stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  // Aggregate MAC = weighted average across all locations (qty-weighted).
  // Falls back to material.currentCost only when no stock exists.
  const aggregateMac = totalQty > 0 ? totalValue / totalQty : toNum(material.currentCost);
  const minStock = material.minStock ? toNum(material.minStock) : null;
  const reorderPoint = material.reorderPoint ? toNum(material.reorderPoint) : null;
  const isOut = totalQty <= 0;
  const isLow = reorderPoint != null && totalQty <= reorderPoint && !isOut;

  // Stock level for progress bar (relative to reorderPoint × 2 as "full")
  const stockCapacity = reorderPoint ? reorderPoint * 2 : minStock ? minStock * 2 : 100;
  const stockPct = Math.min(100, (totalQty / stockCapacity) * 100);
  const stockTone = isOut ? "var(--color-stop)" : isLow ? "var(--color-signal)" : "var(--color-go)";

  return (
    <PageContextProvider value={{
      entityType: "material",
      label: material.name,
      subtitle: material.code,
      recordId: material.id,
    }}>
    <div>
      <RecordRecentItem type="material" id={material.id} label={material.name} sublabel={material.code} href={`/m/materials/${material.id}`} />

      {/* ── Hero card ── */}
      <div
        className="rounded-[0.875rem] border p-3.5 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="grid place-items-center w-11 h-11 rounded-[0.625rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Package className="size-5" style={{ color: "var(--color-ink-700)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-m-section leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {material.name}
            </h1>
            <p className="text-m-body mt-0.5 font-mono" style={{ color: "var(--color-ink-500)" }}>
              {material.code} · {material.category.name}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: stockTone, color: "var(--color-paper)" }}
          >
            {isOut ? "Out" : isLow ? "Low" : "OK"}
          </span>
        </div>

        {/* Stock level bar */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              On hand
            </span>
            <span className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(totalQty, 0)} {material.unit}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${stockPct}%`, backgroundColor: stockTone }} />
          </div>
          <p className="text-m-caption mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {formatCurrency(totalValue)} value
            {reorderPoint ? ` · reorder at ${formatNumber(reorderPoint, 0)}` : ""}
          </p>
        </div>
      </div>

      {/* ── Overview + Details — 2-col grid ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Overview — financials */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <IndianRupee className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>Overview</p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Stock value" value={formatCurrency(totalValue)} />
            <KpiRow label="Standard cost" value={formatCurrency(toNum(material.standardCost))} />
            <KpiRow label="Moving Average Cost" value={formatCurrency(aggregateMac)} />
            <KpiRow label="Locations" value={String(stockItems.length)} sub="sites" />
            <KpiRow label="Movements" value={String(movements.length)} sub="recent" />
          </div>
        </div>

        {/* Details — reorder + tax info */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <ClipboardList className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>Details</p>
          </div>
          <div className="space-y-1.5">
            {minStock != null ? <KpiRow label="Min stock" value={formatNumber(minStock, 0)} sub={material.unit} /> : null}
            {reorderPoint != null ? <KpiRow label="Reorder at" value={formatNumber(reorderPoint, 0)} sub={material.unit} tone={isLow || isOut ? "signal" : undefined} /> : null}
            {material.economicOrderQty ? <KpiRow label="EOQ" value={formatNumber(toNum(material.economicOrderQty), 0)} sub={material.unit} /> : null}
            {material.hsnCode ? <KpiRow label="HSN" value={material.hsnCode} /> : null}
            <KpiRow label="GST" value={`${formatNumber(toNum(material.gstRate), 0)}%`} />
            {material.isLotTracked ? <KpiRow label="Lot tracked" value="Yes" tone="signal" /> : null}
          </div>
        </div>
      </div>

      {/* ── Stock by Location + Recent Movements — 2-col side by side ── */}
      <div className="grid grid-cols-2 gap-2 mb-3 items-start">
        {/* Stock by location column */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-m-body font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            By Location ({stockItems.length})
          </h3>
          {stockItems.length === 0 ? (
            <MobileEmptyState
              icon={Package}
              title="None on hand"
              size="compact"
            />
          ) : (
            stockItems.map((i) => {
              const locQty = toNum(i.qty);
              const locTone = locQty <= 0 ? "var(--color-stop)" : "var(--color-go)";
              return (
                <Link
                  key={i.id}
                  href={`/m/stock?locationId=${i.locationId}`}
                  className="flex flex-col rounded-[0.5rem] border p-2 text-m-body press overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: locTone }} />
                  <p className="text-m-caption font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                    {i.location.name}
                  </p>
                  <p className="text-m-caption mb-1 truncate" style={{ color: "var(--color-ink-500)" }}>
                    Moving Average Cost {formatCurrency(toNum(i.movingAvgCost))}
                  </p>
                  <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                    {formatNumber(locQty, 0)} {material.unit}
                  </p>
                </Link>
              );
            })
          )}
        </div>

        {/* Recent movements column */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-m-body font-bold mb-0.5" style={{ color: "var(--color-ink-950)" }}>
            Movements ({movements.length})
          </h3>
          {movements.length === 0 ? (
            <MobileEmptyState
              icon={ArrowLeftRight}
              title="No movements"
              size="compact"
            />
          ) : (
            movements.map((m) => {
              const isIn = m.toLocation?.name != null && m.fromLocation?.name == null;
              const isOut = m.fromLocation?.name != null && m.toLocation?.name == null;
              const moveTone = isIn ? "var(--color-go)" : isOut ? "var(--color-signal)" : "var(--color-steel)";
              return (
                <div
                  key={m.id}
                  className="flex flex-col rounded-[0.5rem] border p-2 overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="h-0.5 -mx-2 -mt-2 mb-1.5" style={{ backgroundColor: moveTone }} />
                  <p className="text-m-caption font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
                    {m.fromLocation?.name ?? "—"} → {m.toLocation?.name ?? "—"}
                  </p>
                  <p className="text-m-caption mb-1" style={{ color: "var(--color-ink-500)" }}>
                    {formatDate(m.timestamp)}
                  </p>
                  <p className="text-m-caption font-bold tabular-nums" style={{ color: moveTone }}>
                    {isIn ? "+" : isOut ? "−" : ""}{formatNumber(toNum(m.qty), 0)} {material.unit}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Full ledger link ── */}
      <div className="mb-3">
        <MobileCta href={`/m/stock?materialId=${material.id}`} icon={ArrowLeftRight} variant="secondary">
          Full movement ledger
        </MobileCta>
      </div>

      {/* ── Edit + Archive actions (managers only) ── */}
      {hasPermission(role, PERM.INVENTORY_MANAGE) && (
        <MobileMaterialDeleteBtn materialId={material.id} materialName={material.name} />
      )}

      {/* ── Floating Adjust Stock action (managers only) ── */}
      {hasPermission(role, PERM.INVENTORY_MANAGE) && (
        <MobileAdjustStockBtn
          materialId={material.id}
          materialCode={material.code}
          materialName={material.name}
          materialUnit={material.unit}
          currentCost={aggregateMac}
          isLotTracked={material.isLotTracked ?? false}
          stockItems={stockItems.map((i) => ({
            locationId: i.locationId,
            locationName: i.location.name,
            qty: toNum(i.qty),
            movingAvgCost: toNum(i.movingAvgCost),
          }))}
          locations={locationRows.map((l) => ({
            id: l.id,
            name: l.name,
            projectName: l.project?.name ?? null,
          }))}
        />
      )}
    </div>
    </PageContextProvider>
  );
}

/* ─── KPI row ─── */
function KpiRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "go" | "signal" | "stop";
}) {
  const color =
    tone === "go" ? "var(--color-go)" :
    tone === "signal" ? "var(--color-signal-dark)" :
    tone === "stop" ? "var(--color-stop)" :
    "var(--color-ink-950)";
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-m-caption font-bold text-right tabular-nums truncate" style={{ color }}>
        {value}
        {sub ? <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>{sub}</span> : null}
      </span>
    </div>
  );
}
