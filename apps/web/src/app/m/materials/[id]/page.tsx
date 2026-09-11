import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  Package, ArrowLeftRight, AlertTriangle, ArrowLeft,
} from "lucide-react";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import {
  DetailHeroCard,
  DetailProgress,
  DetailKeyValueCard,
} from "@/components/mobile/v2/detail-primitives";

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
    <MobileDetailPage
      params={params}
      perm={PERM.INVENTORY_VIEW}
      managePerm={PERM.INVENTORY_MANAGE}
      what="material details"
      permission={PERM.INVENTORY_VIEW}
      skeletonSections={6}
    >
      {async ({ id, company, canManage }) => {
        const [material, stockItems, movements, locationRows] = await Promise.all([
          prisma.material.findFirst({
            where: { id, companyId: company.id, deletedAt: null },
            include: { category: { select: { name: true } } },
          }),
          prisma.stockLocationItem.findMany({
            where: { materialId: id, location: { companyId: company.id } },
            include: { location: { select: { id: true, name: true, type: true } } },
            orderBy: { location: { name: "asc" } },
          }),
          prisma.stockMovement.findMany({
            where: {...await scopeWhere("StockMovement"), 
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
              <Link href="/m/materials" className="inline-flex items-center gap-1 text-m-body font-bold mb-4 press" style={{ color: "var(--color-ink-500)" }}>
                <ArrowLeft className="size-4" /> Back to materials
              </Link>
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
        const stockToneName: "stop" | "signal" | "go" = isOut ? "stop" : isLow ? "signal" : "go";
        const stockStatus = isOut ? "OUT_OF_STOCK" : isLow ? "LOW_STOCK" : "IN_STOCK";

        // Build detail card entries (conditional on material fields)
        const overviewEntries: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal" }[] = [
          { label: "Stock value", value: formatCurrency(totalValue) },
          { label: "Standard cost", value: formatCurrency(toNum(material.standardCost)) },
          { label: "Moving Average Cost", value: formatCurrency(aggregateMac) },
          { label: "Locations", value: `${String(stockItems.length)} sites` },
          { label: "Movements", value: movements.length >= 10 ? "10+ recent" : `${String(movements.length)} recent` },
        ];

        const detailEntries: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal" }[] = [];
        if (material.grade) detailEntries.push({ label: "Grade", value: material.grade });
        if (material.specification) detailEntries.push({ label: "Specification", value: material.specification });
        if (minStock != null) detailEntries.push({ label: "Min stock", value: `${formatNumber(minStock, 0)} ${material.unit}` });
        if (reorderPoint != null) detailEntries.push({ label: "Reorder at", value: `${formatNumber(reorderPoint, 0)} ${material.unit}`, ...(isLow || isOut ? { tone: "signal" as const } : {}) });
        if (material.economicOrderQty) detailEntries.push({ label: "EOQ", value: `${formatNumber(toNum(material.economicOrderQty), 0)} ${material.unit}` });
        if (material.hsnCode) detailEntries.push({ label: "HSN", value: material.hsnCode });
        detailEntries.push({ label: "GST", value: `${formatNumber(toNum(material.gstRate), 0)}%` });
        if (material.isLotTracked) detailEntries.push({ label: "Lot tracked", value: "Yes", tone: "signal" });

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
            <DetailHeroCard
              icon={Package}
              title={material.name}
              subtitle={`${material.code} · ${material.category.name}`}
              status={stockStatus}
            >
              <DetailProgress
                label="On hand"
                value={`${formatNumber(totalQty, 0)} ${material.unit}`}
                pct={stockPct}
                hint={`${formatCurrency(totalValue)} value${reorderPoint ? ` · reorder at ${formatNumber(reorderPoint, 0)}` : ""}`}
                tone={stockToneName}
              />
            </DetailHeroCard>

            {/* ── Low/Out of stock alert banner ── */}
            {(isOut || isLow) && (
              <div
                className="rounded-[0.5rem] border p-3 flex items-center gap-2 mb-2"
                style={{
                  borderColor: isOut ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
                  backgroundColor: isOut ? "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))" : "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))",
                }}
              >
                <AlertTriangle className="size-4 shrink-0" style={{ color: isOut ? "var(--color-stop)" : "var(--color-signal-dark)" }} />
                <p className="text-m-caption font-bold" style={{ color: isOut ? "var(--color-stop)" : "var(--color-signal-dark)" }}>
                  {isOut
                    ? "Out of stock — tap \u201cAdjust stock\u201d to add opening balance"
                    : `Low stock — below reorder point of ${formatNumber(reorderPoint ?? 0, 0)} ${material.unit}`}
                </p>
              </div>
            )}

            {/* ── Description (if present) ── */}
            {material.description && (
              <div className="rounded-[0.5rem] border p-3 mb-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>Description</p>
                <p className="text-m-body" style={{ color: "var(--color-ink-950)" }}>{material.description}</p>
              </div>
            )}

            {/* ── Overview + Details — 2-col grid ── */}
            <div className="grid grid-cols-2 gap-2">
              <DetailKeyValueCard title="Overview" entries={overviewEntries} />
              <DetailKeyValueCard title="Details" entries={detailEntries} />
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
                    description={canManage ? "Tap \u201cAdjust stock\u201d below to add opening balance" : "Stock will appear here once received"}
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
            {canManage && (
              <MobileMaterialDeleteBtn materialId={material.id} materialName={material.name} />
            )}

            {/* ── Floating Adjust Stock action (managers only) ── */}
            {canManage && (
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
      }}
    </MobileDetailPage>
  );
}
