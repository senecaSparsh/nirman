import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Home, ShoppingCart, Building2,
  IndianRupee, ClipboardList, TrendingUp,
} from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { ShareButton } from "@/components/share-button";
import { MobileUnitActions } from "./MobileUnitActions";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

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
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileUnitDetailContent params={params} />
    </Suspense>
  );
}

async function MobileUnitDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const unit = await prisma.builtUnit.findFirst({
    where: { id, deletedAt: null, project: { companyId: company.id } },
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
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);
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

  const nextAction = resolveNextAction("builtUnit", unit.status, role);

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
      <div
        className="rounded-[0.875rem] border p-3.5 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="grid place-items-center w-11 h-11 rounded-[0.625rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Home className="size-5" style={{ color: "var(--color-ink-700)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-m-section leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {unit.unitNumber}
            </h1>
            <p className="text-m-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {typeLabel} · {formatNumber(toNum(unit.area), 0)} {unit.areaUnit}
            </p>
          </div>
          <MobileStatusBadge status={unit.status} />
        </div>

        {/* Project link */}
        <Link
          href={`/m/projects/${unit.project.id}`}
          className="flex items-center gap-1.5 text-m-label mt-2.5 text-m-body press"
          style={{ color: "var(--color-steel)" }}
        >
          <Building2 className="size-3 shrink-0" />
          <span className="truncate underline underline-offset-2">{unit.project.name}</span>
        </Link>

        {/* Profitability bar — only if we have both asking price and production cost */}
        {askingPrice != null && productionCost > 0 && profit != null ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Margin
              </span>
              <span className="text-m-label font-bold tabular-nums" style={{ color: profit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}>
                {formatCurrency(profit)} {marginPct != null ? `(${formatNumber(marginPct, 0)}%)` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, marginPct ?? 0))}%`,
                  backgroundColor: profit >= 0 ? "var(--color-go)" : "var(--color-stop)",
                }}
              />
            </div>
            <p className="text-m-caption mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              cost {formatCurrency(productionCost)} → price {formatCurrency(askingPrice)}
            </p>
          </div>
        ) : null}
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
            <KpiRow label="Asking" value={askingPrice != null ? formatCurrency(askingPrice) : "—"} tone={askingPrice == null ? "signal" : undefined} />
            <KpiRow label="Cost" value={formatCurrency(productionCost)} />
            <KpiRow label="Valuation" value={formatCurrency(currentValuation)} />
            {profit != null ? <KpiRow label="Profit" value={formatCurrency(profit)} tone={profit >= 0 ? "go" : "stop"} /> : null}
            {unit.nrvWriteDown && toNum(unit.nrvWriteDown) > 0 ? <KpiRow label="Write-down" value={formatCurrency(toNum(unit.nrvWriteDown))} tone="stop" /> : null}
          </div>
        </div>

        {/* Details — physical attributes */}
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
            <KpiRow label="Type" value={typeLabel} />
            <KpiRow label="Area" value={formatNumber(toNum(unit.area), 0)} sub={unit.areaUnit} />
            {unit.floor != null ? <KpiRow label="Floor" value={String(unit.floor)} /> : null}
            {unit.wing ? <KpiRow label="Wing" value={unit.wing} /> : null}
            {unit.phase ? <KpiRow label="Phase" value={unit.phase.name} /> : null}
            <KpiRow label="Origin" value={unit.originType === "PURCHASED" ? "Purchased" : "Built"} />
          </div>
        </div>
      </div>

      {/* ── RERA areas — compact section only if any exist ── */}
      {hasRera ? (
        <>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            RERA Areas
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {unit.superBuiltUpArea ? (
              <ReraCard label="Super Built-Up" value={formatNumber(toNum(unit.superBuiltUpArea), 0)} unit={unit.areaUnit} />
            ) : null}
            {unit.carpetArea ? (
              <ReraCard label="Carpet (RERA)" value={formatNumber(toNum(unit.carpetArea), 0)} unit={unit.areaUnit} />
            ) : null}
            {unit.balconyArea ? (
              <ReraCard label="Balcony" value={formatNumber(toNum(unit.balconyArea), 0)} unit={unit.areaUnit} />
            ) : null}
            {unit.clearHeight ? (
              <ReraCard label="Clear Height" value={formatNumber(toNum(unit.clearHeight), 0)} unit={unit.areaUnit} />
            ) : null}
            {unit.hasLoadingDock ? (
              <ReraCard label="Loading Dock" value="Yes" unit="" />
            ) : null}
          </div>
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
          <div className="space-y-1.5">
            <KpiRow label="Buyer" value={sale.customer.name} />
            {sale.customer.phone ? <KpiRow label="Phone" value={sale.customer.phone} /> : null}
            <KpiRow label="Sale price" value={formatCurrency(toNum(sale.salePrice))} />
            <KpiRow label="Profit" value={formatCurrency(toNum(sale.profit))} tone={toNum(sale.profit) >= 0 ? "go" : "stop"} />
            <KpiRow label="Date" value={formatDate(sale.saleDate)} />
            <KpiRow label="Payment" value={sale.paymentStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} tone={sale.paymentStatus === "PAID" ? "go" : sale.paymentStatus === "PENDING" ? "signal" : undefined} />
            <KpiRow label="Stage" value={sale.saleStage.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} />
          </div>
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
        {sub ? <span className="font-normal ml-1" style={{ color: "var(--color-ink-500)" }}>{" "}{sub}</span> : null}
      </span>
    </div>
  );
}

/* ─── RERA area card ─── */
function ReraCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
    >
      <p className="text-m-caption mb-0.5" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
      <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
        {value}{unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}
