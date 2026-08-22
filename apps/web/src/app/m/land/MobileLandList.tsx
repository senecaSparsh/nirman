"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search, X, MapPin, TrendingUp, Plus,
  CheckCircle2, PauseCircle, Split, Maximize, DollarSign, Building2,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { MobileNewLandDialog } from "./MobileNewLandDialog";
import { MobileLandWizard } from "./MobileLandWizard";

interface ParcelItem {
  id: string;
  number: string;
  status: string;
  purpose?: "SELL" | "PROJECT" | "HOLD" | null;
  area: number;
  currentValuation: number;
  askingPrice: number | null;
  parentParcelId: string | null;
  childCount: number;
}

interface LandPurchaseItem {
  id: string;
  sellerName: string;
  sellerContact: string | null;
  purchaseDate: string;
  totalArea: number;
  areaUnit: string;
  totalCost: number;
  registryNo: string | null;
  location: string | null;
  projectId: string | null;
  projectName: string | null;
  mode?: "WHOLE" | "SUBDIVIDED" | null;
  landType?: "FREEHOLD" | "LEASEHOLD" | null;
  parcelCount: number;
  availableCount: number;
  holdCount: number;
  soldCount: number;
  partitionedCount: number;
  availableArea: number;
  unsoldValue: number;
  costBasis: number;
  valuationGain: number;
  parcels: ParcelItem[];
}

interface Portfolio {
  purchaseCount: number;
  totalArea: number;
  areaUnit: string;
  parcelCount: number;
  availableCount: number;
  holdCount: number;
  soldCount: number;
  partitionedCount: number;
  availableArea: number;
  unsoldValue: number;
  costBasis: number;
}

const AREA_UNIT_SHORT: Record<string, string> = {
  SQFT: "sqft",
  SQM: "sqm",
  SQYD: "sqyd",
  ACRE: "acre",
  BIGHA: "bigha",
  KATHA: "katha",
  HECTARE: "ha",
};

/**
 * Land portfolio list — two vertical columns matching the desktop layout:
 * Whole (left) | Sub-divided (right). Each column has a header and a
 * vertical stack of cards. Cards don't carry a type badge since the
 * column itself tells you the classification.
 */
export function MobileLandList({
  items,
  portfolio,
  canManage,
  projects,
  sellers,
  company,
}: {
  items: LandPurchaseItem[];
  portfolio: Portfolio;
  canManage: boolean;
  projects: { id: string; name: string }[];
  sellers?: { id: string; name: string; phone?: string | null }[];
  company?: { id: string; name: string } | null;
}) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // A purchase is "sub-divided" if it has been partitioned (root split into
  // sub-parcels) OR has more than 1 sellable parcel. "Whole" = single parcel.
  const isSubdivided = (p: LandPurchaseItem) =>
    p.partitionedCount > 0 || p.parcelCount > 1;

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (p) =>
        p.sellerName.toLowerCase().includes(q) ||
        (p.location?.toLowerCase().includes(q) ?? false) ||
        (p.projectName?.toLowerCase().includes(q) ?? false) ||
        (p.registryNo?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const wholeItems = filtered.filter((p) => !isSubdivided(p));
  const subdividedItems = filtered.filter((p) => isSubdivided(p));

  const unitShort = AREA_UNIT_SHORT[portfolio.areaUnit] ?? portfolio.areaUnit.toLowerCase();
  const totalParcels = portfolio.parcelCount + portfolio.partitionedCount;

  return (
    <div>
      {/* ── Portfolio summary — 4-column compact strip ── */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <SummaryStat
          label="Value"
          value={formatCurrencyCompact(portfolio.unsoldValue)}
        />
        <SummaryStat
          label="Area"
          value={`${formatNumber(portfolio.totalArea, 0)}`}
          unit={unitShort}
        />
        <SummaryStat
          label="Parcels"
          value={formatNumber(totalParcels, 0)}
        />
        <SummaryStat
          label="Avail"
          value={`${formatNumber(portfolio.availableArea, 0)}`}
          unit={unitShort}
        />
      </div>

      {/* ── Parcel status bar — proportional segments + legend ── */}
      {totalParcels > 0 ? (
        <div
          className="rounded-[0.5rem] border px-3 py-2.5 mb-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            {portfolio.availableCount > 0 ? (
              <div style={{ width: `${(portfolio.availableCount / totalParcels) * 100}%`, backgroundColor: "var(--color-go)" }} />
            ) : null}
            {portfolio.holdCount > 0 ? (
              <div style={{ width: `${(portfolio.holdCount / totalParcels) * 100}%`, backgroundColor: "var(--color-signal)" }} />
            ) : null}
            {portfolio.soldCount > 0 ? (
              <div style={{ width: `${(portfolio.soldCount / totalParcels) * 100}%`, backgroundColor: "var(--color-stop)" }} />
            ) : null}
            {portfolio.partitionedCount > 0 ? (
              <div style={{ width: `${(portfolio.partitionedCount / totalParcels) * 100}%`, backgroundColor: "var(--color-steel)" }} />
            ) : null}
          </div>
          <div className="flex items-center gap-2.5 text-[0.5625rem] font-semibold">
            <LegendDot color="var(--color-go)" label={`${portfolio.availableCount} avail`} />
            <LegendDot color="var(--color-signal)" label={`${portfolio.holdCount} hold`} />
            <LegendDot color="var(--color-stop)" label={`${portfolio.soldCount} sold`} />
            {portfolio.partitionedCount > 0 ? (
              <LegendDot color="var(--color-steel)" label={`${portfolio.partitionedCount} part`} />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Search ── */}
      <div className="mb-3">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search seller, location, project…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query ? (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press">
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Two vertical columns: Whole | Sub-divided (matches desktop) ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-10 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <MapPin className="size-7 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query ? "No matching land" : "No land purchases"}
          </p>
          <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {query ? "Try a different search" : canManage ? "Tap + to record your first land acquisition" : "Land acquisitions will appear here"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 items-start">
          {/* ── Left column: Whole ── */}
          <div className="flex flex-col gap-2">
            <ColumnHeader
              icon={Maximize}
              label="Whole"
              count={wholeItems.length}
              color="var(--color-go)"
              hint="single parcel"
            />
            {wholeItems.length === 0 ? (
              <ColumnEmpty icon={Maximize} label="No whole land" />
            ) : (
              wholeItems.map((p) => (
                <PurchaseCard key={p.id} purchase={p} unitShort={unitShort} />
              ))
            )}
          </div>

          {/* ── Right column: Sub-divided ── */}
          <div className="flex flex-col gap-2">
            <ColumnHeader
              icon={Split}
              label="Sub-divided"
              count={subdividedItems.length}
              color="var(--color-steel)"
              hint="split into plots"
            />
            {subdividedItems.length === 0 ? (
              <ColumnEmpty icon={Split} label="No sub-divided" />
            ) : (
              subdividedItems.map((p) => (
                <PurchaseCard key={p.id} purchase={p} unitShort={unitShort} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── FAB: New Land Purchase (opens guided wizard) ── */}
      {canManage && (
        <button
          onClick={() => setShowWizard(true)}
          className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
          style={{
            bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
            backgroundColor: "var(--color-ink-950)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          aria-label="Record new land purchase"
        >
          <Plus className="size-5" />
        </button>
      )}

      {/* ── Guided Land Purchase Wizard (primary) ── */}
      {showWizard && (
        <MobileLandWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          projects={projects}
          sellers={sellers ?? []}
          company={company}
        />
      )}

      {/* ── Simple Land Purchase Dialog (legacy/quick add) ── */}
      {showNew && (
        <MobileNewLandDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          projects={projects}
        />
      )}
    </div>
  );
}

/* ─── Summary stat tile (4-column compact strip) ─── */
function SummaryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      className="rounded-[0.375rem] border px-1.5 py-1.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="text-[0.375rem] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
      <p className="text-[0.5625rem] font-bold tabular-nums leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
        {value}
        {unit ? <span className="text-[0.4375rem] font-medium ml-0.5" style={{ color: "var(--color-ink-500)" }}>{unit}</span> : null}
      </p>
    </div>
  );
}

/* ─── Legend dot ─── */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-0.5" style={{ color }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/* ─── Column header — icon + label + count + hint ─── */
function ColumnHeader({
  icon: Icon,
  label,
  count,
  color,
  hint,
}: {
  icon: typeof Maximize;
  label: string;
  count: number;
  color: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-1 mb-0.5">
      <Icon className="size-3 shrink-0" style={{ color }} />
      <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
        {label}
      </span>
      <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
        ({count})
      </span>
      <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-400)" }}>
        · {hint}
      </span>
    </div>
  );
}

/* ─── Column empty state ─── */
function ColumnEmpty({ icon: Icon, label }: { icon: typeof Maximize; label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
    >
      <Icon className="size-4 mb-1" style={{ color: "var(--color-ink-300)" }} />
      <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
    </div>
  );
}

/* ─── Purchase card — clean, no type badge (column tells you the type) ───
 * Structure:
 *   1. Name row  — location (bold, left) + Freehold/Leasehold (rightmost)
 *   2. Meta line — seller · project (merged, subtle)
 *   3. Metrics   — Area | Value (plain text, no boxes)
 *   4. Footer    — status counts + gain %
 */
function PurchaseCard({
  purchase: p,
  unitShort,
}: {
  purchase: LandPurchaseItem;
  unitShort: string;
}) {
  const gainPct = p.costBasis > 0
    ? Math.round((p.valuationGain / p.costBasis) * 100)
    : 0;
  const gainPositive = p.valuationGain >= 0;
  const isLeasehold = p.landType === "LEASEHOLD";

  return (
    <Link
      href={`/m/land/${p.id}`}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* 1. Name row — location (left) + Freehold/Leasehold (rightmost) */}
      <div className="px-2 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-[0.625rem] font-bold leading-tight line-clamp-2 flex-1 min-w-0" style={{ color: "var(--color-ink-950)" }}>
            {p.location ?? p.sellerName}
          </p>
          <span
            className="shrink-0 inline-flex items-center gap-0.5 text-[0.4375rem] font-semibold leading-none mt-px"
            style={{ color: isLeasehold ? "var(--color-signal-dark)" : "var(--color-go)" }}
            title={isLeasehold ? "Leasehold" : "Freehold"}
          >
            <span className="size-1 rounded-full" style={{ backgroundColor: isLeasehold ? "var(--color-signal)" : "var(--color-go)" }} />
            {isLeasehold ? "Lease" : "Free"}
          </span>
        </div>
      </div>

      {/* 2. Meta line — seller · project (merged, subtle) */}
      <div className="px-2 pt-0.5 min-h-[0.75rem]">
        <div className="flex items-center gap-1 text-[0.5rem] min-w-0" style={{ color: "var(--color-ink-500)" }}>
          <span className="truncate">{p.sellerName}</span>
          {p.projectName ? (
            <>
              <span style={{ color: "var(--color-ink-300)" }}>·</span>
              <span className="inline-flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-steel)" }}>
                <Building2 className="size-1.5" />
                <span className="truncate max-w-[4.5rem]">{p.projectName}</span>
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* 3. Metrics — Area | Value (plain text, no boxes) */}
      <div className="px-2 pt-1.5 pb-1.5 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Area
          </p>
          <p className="text-[0.5625rem] font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(p.totalArea, 0)}
            <span className="text-[0.4375rem] font-medium ml-0.5" style={{ color: "var(--color-ink-500)" }}>{unitShort}</span>
          </p>
        </div>
        <div className="text-right min-w-0">
          <p className="text-[0.375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Value
          </p>
          <p className="text-[0.5625rem] font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(p.unsoldValue)}
          </p>
        </div>
      </div>

      {/* 4. Footer — status counts + gain */}
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ borderTop: "1px solid var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        {p.availableCount > 0 ? (
          <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-go)" }}>
            <CheckCircle2 className="size-1.5" />
            {p.availableCount}
          </span>
        ) : null}
        {p.holdCount > 0 ? (
          <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
            <PauseCircle className="size-1.5" />
            {p.holdCount}
          </span>
        ) : null}
        {p.soldCount > 0 ? (
          <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-stop)" }}>
            <DollarSign className="size-1.5" />
            {p.soldCount}
          </span>
        ) : null}
        {p.partitionedCount > 0 ? (
          <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-steel)" }}>
            <Split className="size-1.5" />
            {p.partitionedCount}
          </span>
        ) : null}

        {/* Gain */}
        <span
          className="ml-auto flex items-center gap-0.5 text-[0.4375rem] font-bold tabular-nums"
          style={{ color: gainPositive ? "var(--color-go)" : "var(--color-stop)" }}
        >
          <TrendingUp className="size-1.5" style={{ transform: gainPositive ? "none" : "scaleY(-1)" }} />
          {gainPct > 0 ? "+" : ""}{gainPct}%
        </span>
      </div>
    </Link>
  );
}
