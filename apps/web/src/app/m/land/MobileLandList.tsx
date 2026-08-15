"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search, X, MapPin, TrendingUp, Plus,
  CheckCircle2, PauseCircle, Split, Maximize,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { MobileNewLandDialog } from "./MobileNewLandDialog";

interface ParcelItem {
  id: string;
  number: string;
  status: string;
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
  parcelCount: number;
  availableCount: number;
  holdCount: number;
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
 * Land portfolio list — each purchase is a wide portfolio card showing
 * the full picture: location, area, cost, valuation, and a visual parcel
 * status bar. Not a 2-col grid — land is high-value, low-volume, and
 * each entry deserves space.
 */
export function MobileLandList({
  items,
  portfolio,
  canManage,
  projects,
}: {
  items: LandPurchaseItem[];
  portfolio: Portfolio;
  canManage: boolean;
  projects: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);

  // A purchase is "sub-divided" if it has been partitioned (root split into
  // sub-parcels) OR has more than 1 sellable parcel. "Whole" = single parcel
  // sold as one piece.
  const isSubdivided = (p: LandPurchaseItem) =>
    p.partitionedCount > 0 || p.parcelCount > 1;

  const searchFilter = useCallback((p: LandPurchaseItem) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.sellerName.toLowerCase().includes(q) ||
      (p.location?.toLowerCase().includes(q) ?? false) ||
      (p.projectName?.toLowerCase().includes(q) ?? false) ||
      (p.registryNo?.toLowerCase().includes(q) ?? false)
    );
  }, [query]);

  const wholeItems = useMemo(
    () => items.filter((p) => !isSubdivided(p) && searchFilter(p)),
    [items, searchFilter],
  );
  const subdividedItems = useMemo(
    () => items.filter((p) => isSubdivided(p) && searchFilter(p)),
    [items, searchFilter],
  );

  const unitShort = AREA_UNIT_SHORT[portfolio.areaUnit] ?? portfolio.areaUnit.toLowerCase();

  return (
    <div>
      {/* ── Portfolio summary — wide banner, not a strip ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Portfolio Value
            </p>
            <p className="text-[1.25rem] font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(portfolio.unsoldValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Area
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(portfolio.totalArea, 0)} {unitShort}
            </p>
          </div>
        </div>

        {/* Parcel status bar — proportional segments */}
        {portfolio.parcelCount + portfolio.partitionedCount > 0 ? (
          <div className="flex h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            {portfolio.availableCount > 0 ? (
              <div
                style={{
                  width: `${(portfolio.availableCount / (portfolio.parcelCount + portfolio.partitionedCount)) * 100}%`,
                  backgroundColor: "var(--color-go)",
                }}
              />
            ) : null}
            {portfolio.holdCount > 0 ? (
              <div
                style={{
                  width: `${(portfolio.holdCount / (portfolio.parcelCount + portfolio.partitionedCount)) * 100}%`,
                  backgroundColor: "var(--color-signal)",
                }}
              />
            ) : null}
            {portfolio.partitionedCount > 0 ? (
              <div
                style={{
                  width: `${(portfolio.partitionedCount / (portfolio.parcelCount + portfolio.partitionedCount)) * 100}%`,
                  backgroundColor: "var(--color-steel)",
                }}
              />
            ) : null}
          </div>
        ) : null}

        {/* Legend counts */}
        <div className="flex items-center gap-3 text-[0.5rem] font-semibold">
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-go)" }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-go)" }} />
            {portfolio.availableCount} available
          </span>
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
            {portfolio.holdCount} hold
          </span>
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-steel)" }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-steel)" }} />
            {portfolio.partitionedCount} partitioned
          </span>
        </div>
      </div>

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

      {/* ── 2-column grid: Whole land | Sub-divided land ── */}
      {wholeItems.length === 0 && subdividedItems.length === 0 ? (
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
          {/* ── Left column: Whole land ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 mb-0.5">
              <Maximize className="size-2.5" style={{ color: "var(--color-go)" }} />
              <span className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
                Whole
              </span>
              <span className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                ({wholeItems.length})
              </span>
            </div>
            {wholeItems.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
              >
                <Maximize className="size-4 mb-1" style={{ color: "var(--color-ink-300)" }} />
                <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                  No whole land
                </p>
              </div>
            ) : (
              wholeItems.map((p) => (
                <PurchaseCard key={p.id} purchase={p} unitShort={unitShort} />
              ))
            )}
          </div>

          {/* ── Right column: Sub-divided land ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 mb-0.5">
              <Split className="size-2.5" style={{ color: "var(--color-steel)" }} />
              <span className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-600)" }}>
                Sub-divided
              </span>
              <span className="text-[0.4375rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                ({subdividedItems.length})
              </span>
            </div>
            {subdividedItems.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
              >
                <Split className="size-4 mb-1" style={{ color: "var(--color-ink-300)" }} />
                <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                  No sub-divided
                </p>
              </div>
            ) : (
              subdividedItems.map((p) => (
                <PurchaseCard key={p.id} purchase={p} unitShort={unitShort} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── FAB: New Land Purchase ── */}
      {canManage && (
        <button
          onClick={() => setShowNew(true)}
          className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
          style={{
            bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
            backgroundColor: "var(--color-ink-950)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          aria-label="Add new land purchase"
        >
          <Plus className="size-5" />
        </button>
      )}

      {/* ── New Land Purchase Dialog ── */}
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

/* ─── Purchase card — compact for 2-column grid ─── */
function PurchaseCard({ purchase: p, unitShort }: { purchase: LandPurchaseItem; unitShort: string }) {
  const gainPct = p.costBasis > 0
    ? Math.round((p.valuationGain / p.costBasis) * 100)
    : 0;
  const gainPositive = p.valuationGain >= 0;

  return (
    <Link
      href={`/m/land/${p.id}`}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="p-2">
        {/* Location */}
        <p className="text-[0.6875rem] font-bold leading-tight truncate mb-0.5" style={{ color: "var(--color-ink-950)" }}>
          {p.location ?? p.sellerName}
        </p>
        <p className="text-[0.4375rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
          {p.sellerName}{p.projectName ? ` · ${p.projectName}` : ""}
        </p>

        {/* Area + Value */}
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(p.totalArea, 0)} {unitShort}
          </p>
          <span className="text-[0.375rem]" style={{ color: "var(--color-ink-400)" }}>·</span>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(p.unsoldValue)}
          </p>
        </div>

        {/* Status footer */}
        <div
          className="flex items-center gap-1.5 -mx-2 -mb-2 px-2 py-1"
          style={{ borderTop: "1px solid var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          {p.availableCount > 0 ? (
            <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-go)" }}>
              <CheckCircle2 className="size-2" />
              {p.availableCount}
            </span>
          ) : null}
          {p.holdCount > 0 ? (
            <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
              <PauseCircle className="size-2" />
              {p.holdCount}
            </span>
          ) : null}
          {p.partitionedCount > 0 ? (
            <span className="flex items-center gap-0.5 text-[0.4375rem] font-semibold" style={{ color: "var(--color-steel)" }}>
              <Split className="size-2" />
              {p.partitionedCount}
            </span>
          ) : null}

          {/* Gain */}
          <span
            className="ml-auto flex items-center gap-0.5 text-[0.4375rem] font-bold tabular-nums"
            style={{ color: gainPositive ? "var(--color-go)" : "var(--color-stop)" }}
          >
            <TrendingUp className="size-2" style={{ transform: gainPositive ? "none" : "scaleY(-1)" }} />
            {gainPct > 0 ? "+" : ""}{gainPct}%
          </span>
        </div>
      </div>
    </Link>
  );
}

