import { prisma } from "@nirman/db";
import {
  Home, ShoppingCart, Building2, TrendingUp,
} from "lucide-react";
import { toNum, getUserPermissions, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailProgress,
  DetailKeyValue,
  DetailKeyValueCard,
  DetailStatGrid,
  DetailLinkRow,
} from "@/components/mobile/v2/detail-primitives";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { ShareButton } from "@/components/share-button";
import { MobileUnitActions } from "./MobileUnitActions";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";

/**
 * /m/units/[id] — built-unit detail page.
 *
 * Layout:
 *   1. Back button
 *   2. Hero card — unit number, type, status, project link, profitability bar
 *   3. Overview + Details — 2-col grid
 *   4. RERA areas — compact section (only if any exist)
 *   5. Sale info — if sold/booked, show buyer + sale details
 *   6. Actions — Sell CTA + Share (if sellable)
 */
export default function MobileUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.ASSETS_MANAGE} skeletonSections={6}>
      {async ({ id, company, role, canManage }) => {
        const overrides = await getUserPermissions();

        const unit = await prisma.builtUnit.findFirst({
          where: {...await scopeWhere("BuiltUnit"),  id, deletedAt: null, project: { companyId: company.id } },
          include: {
            project: { select: { id: true, name: true } },
            phase: { select: { name: true } },
            assetSales: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { customer: { select: { id: true, name: true, phone: true } } },
            },
          },
        });

        if (!unit) {
          return (
            <div>
              <MobileEmptyState icon={Home} title="Unit not found" />
            </div>
          );
        }

        const canSell = hasPermission(role, PERM.SALE_CREATE);
        const isSellable = unit.status === "AVAILABLE";

        const askingPrice = unit.askingPrice ? toNum(unit.askingPrice) : null;
        const productionCost = toNum(unit.productionCost);
        const currentValuation = toNum(unit.currentValuation);
        const profit = askingPrice != null ? askingPrice - productionCost : null;
        const marginPct = askingPrice != null && productionCost > 0 && profit != null ? (profit / productionCost) * 100 : null;

        const typeLabel = unit.unitType.replace(/_/g, " ").toLowerCase();
        const sale = unit.assetSales[0];

        // RERA areas
        const hasRera = unit.carpetArea || unit.superBuiltUpArea || unit.balconyArea || unit.clearHeight || unit.hasLoadingDock;

        const nextAction = resolveNextAction("builtUnit", unit.status, role, overrides);

        // ── Overview entries (financials) ──
        const overviewEntries: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal" }[] = [
          { label: "Asking", value: askingPrice != null ? formatCurrency(askingPrice) : "—", tone: askingPrice == null ? "signal" : "default" },
          { label: "Cost", value: formatCurrency(productionCost) },
          { label: "Valuation", value: formatCurrency(currentValuation) },
        ];
        if (profit != null) {
          overviewEntries.push({ label: "Profit", value: formatCurrency(profit), tone: profit >= 0 ? "go" : "stop" });
        }
        if (unit.nrvWriteDown && toNum(unit.nrvWriteDown) > 0) {
          overviewEntries.push({ label: "Write-down", value: formatCurrency(toNum(unit.nrvWriteDown)), tone: "stop" });
        }

        // ── Detail entries (physical attributes) ──
        const detailEntries: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal" }[] = [
          { label: "Type", value: typeLabel },
          { label: "Area", value: `${formatNumber(toNum(unit.area), 0)} ${unit.areaUnit}` },
        ];
        if (unit.floor != null) {
          detailEntries.push({ label: "Floor", value: String(unit.floor) });
        }
        if (unit.wing) {
          detailEntries.push({ label: "Wing", value: unit.wing });
        }
        if (unit.phase) {
          detailEntries.push({ label: "Phase", value: unit.phase.name });
        }
        detailEntries.push({ label: "Origin", value: unit.originType === "PURCHASED" ? "Purchased" : "Built" });

        // ── RERA stat cards ──
        const reraStats: { label: string; value: string }[] = [];
        if (unit.superBuiltUpArea) {
          reraStats.push({ label: "Super Built-Up", value: `${formatNumber(toNum(unit.superBuiltUpArea), 0)} ${unit.areaUnit}` });
        }
        if (unit.carpetArea) {
          reraStats.push({ label: "Carpet (RERA)", value: `${formatNumber(toNum(unit.carpetArea), 0)} ${unit.areaUnit}` });
        }
        if (unit.balconyArea) {
          reraStats.push({ label: "Balcony", value: `${formatNumber(toNum(unit.balconyArea), 0)} ${unit.areaUnit}` });
        }
        if (unit.clearHeight) {
          reraStats.push({ label: "Clear Height", value: `${formatNumber(toNum(unit.clearHeight), 0)} ${unit.areaUnit}` });
        }
        if (unit.hasLoadingDock) {
          reraStats.push({ label: "Loading Dock", value: "Yes" });
        }

        return (
          <PageContextProvider value={{
            entityType: "builtUnit",
            flowId: "builtUnit",
            status: unit.status,
            label: unit.unitNumber,
            subtitle: unit.project.name,
            recordId: unit.id,
          }}>
          <div>
            {/* ── Next action — the one thing to do, doable on this page ── */}
            {nextAction ? (
              <NextActionCardView
                label={nextAction.label}
                reason={nextAction.reason}
                tone={nextAction.tone ?? "signal"}
                hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
                href={nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", unit.id) : undefined}
              />
            ) : null}

            {/* ── Hero card ── */}
            <DetailHeroCard
              icon={Home}
              title={unit.unitNumber}
              subtitle={`${typeLabel} · ${formatNumber(toNum(unit.area), 0)} ${unit.areaUnit}`}
              status={unit.status}
            >
              {/* Project link */}
              <DetailLinkRow
                href={`/m/projects/${unit.project.id}`}
                icon={Building2}
                label={unit.project.name}
              />

              {/* Profitability bar — only if we have both asking price and production cost */}
              {askingPrice != null && productionCost > 0 && profit != null ? (
                <DetailProgress
                  label="Margin"
                  value={`${formatCurrency(profit)} ${marginPct != null ? `(${formatNumber(marginPct, 0)}%)` : ""}`}
                  pct={marginPct ?? 0}
                  hint={`cost ${formatCurrency(productionCost)} → price ${formatCurrency(askingPrice)}`}
                  tone={profit >= 0 ? "go" : "stop"}
                />
              ) : null}
            </DetailHeroCard>

            {/* ── Overview + Details — 2-col grid ── */}
            <div className="grid grid-cols-2 gap-2">
              <DetailKeyValueCard title="Overview" entries={overviewEntries} />
              <DetailKeyValueCard title="Details" entries={detailEntries} />
            </div>

            {/* ── RERA areas — compact section only if any exist ── */}
            {hasRera ? (
              <>
                <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
                  RERA Areas
                </h3>
                <DetailStatGrid stats={reraStats} cols={2} />
              </>
            ) : null}

            {/* ── Sale info — if sold or has active sale ── */}
            {sale ? (
              <div
                className="rounded-[0.625rem] border p-3 mb-3"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: unit.status === "SOLD" ? "var(--color-go-wash)" : "var(--color-signal-wash)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
                    style={{ backgroundColor: unit.status === "SOLD" ? "var(--color-go)" : "var(--color-signal)" }}
                  >
                    <TrendingUp className="size-3.5" style={{ color: "var(--color-paper)" }} />
                  </span>
                  <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {unit.status === "SOLD" ? "Sold" : "Sale in progress"}
                  </p>
                </div>
                <dl className="divide-y" style={{ borderColor: "var(--color-line)" }}>
                  <DetailKeyValue label="Buyer" value={sale.customer.name} />
                  {sale.customer.phone ? <DetailKeyValue label="Phone" value={sale.customer.phone} /> : null}
                  <DetailKeyValue label="Sale price" value={formatCurrency(toNum(sale.salePrice))} />
                  <DetailKeyValue label="Profit" value={formatCurrency(toNum(sale.profit))} tone={toNum(sale.profit) >= 0 ? "go" : "stop"} />
                  <DetailKeyValue label="Date" value={formatDate(sale.saleDate)} />
                  <DetailKeyValue label="Payment" value={sale.paymentStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} tone={sale.paymentStatus === "PAID" ? "go" : sale.paymentStatus === "PENDING" ? "signal" : "default"} />
                  <DetailKeyValue label="Stage" value={sale.saleStage.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} />
                </dl>
              </div>
            ) : null}

            {/* ── Actions ── */}
            {isSellable && canSell ? (
              <div className="space-y-2 mb-3">
                <MobileCta href={`/m/sales/new?builtUnitId=${unit.id}`} icon={ShoppingCart} variant="primary">
                  Sell this unit
                </MobileCta>
                <ShareButton
                  title={`Unit ${unit.unitNumber} — ${unit.project.name}`}
                  text={`Unit ${unit.unitNumber} (${typeLabel}) at ${unit.project.name}${askingPrice ? ` — Price: ${formatCurrency(askingPrice)}` : ""}`}
                  url={`/print/unit-spec/${unit.id}`}
                  variant="outline"
                  size="touch"
                  label="Share Unit Details"
                  className="w-full"
                />
              </div>
            ) : null}

            {/* ── Management actions (edit, status, valuation, delete) ── */}
            <MobileUnitActions
              unitId={unit.id}
              projectId={unit.project.id}
              unitNumber={unit.unitNumber}
              canManage={canManage}
              currentStatus={unit.status as "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "HOLD" | "SOLD"}
              initialUnitType={unit.unitType as "BHK_1" | "BHK_2" | "BHK_3" | "BHK_4" | "SHOP" | "OFFICE" | "WAREHOUSE_UNIT" | "VILLA" | "OTHER"}
              initialFloor={unit.floor}
              initialWing={unit.wing}
              initialArea={String(toNum(unit.area))}
              initialAreaUnit={unit.areaUnit}
              initialAskingPrice={unit.askingPrice ? String(toNum(unit.askingPrice)) : null}
              initialCarpetArea={unit.carpetArea ? String(toNum(unit.carpetArea)) : null}
              initialSuperBuiltUpArea={unit.superBuiltUpArea ? String(toNum(unit.superBuiltUpArea)) : null}
              initialBalconyArea={unit.balconyArea ? String(toNum(unit.balconyArea)) : null}
              initialClearHeight={unit.clearHeight ? String(toNum(unit.clearHeight)) : null}
              initialHasLoadingDock={unit.hasLoadingDock}
              initialCurrentValuation={String(currentValuation)}
            />
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
