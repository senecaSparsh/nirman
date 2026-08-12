"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Package, Search, X,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  ArrowRight, Truck,
  type LucideIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";

/* ── Time helper ── */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export type StockItemEntry = {
  materialId: string;
  materialName: string;
  unit: string;
  qty: number;
};

export type StockLocationItem = {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  totalQty: number;
  items: StockItemEntry[];
};

export type StockMovementItem = {
  id: string;
  qty: number;
  materialName: string;
  materialUnit: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  movementType: string;
  timestamp: string;
};

/* ── Location type helpers ── */
const TYPE_LABELS: Record<string, string> = {
  COMPANY_WAREHOUSE: "Warehouse",
  PROJECT_SITE: "Site",
  DEPARTMENT: "Dept",
};

const TYPE_COLORS: Record<string, string> = {
  COMPANY_WAREHOUSE: "var(--color-steel)",
  PROJECT_SITE: "var(--color-go)",
  DEPARTMENT: "var(--color-signal)",
};

const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type.replace(/_/g, " ");
const typeColor = (type: string): string => TYPE_COLORS[type] ?? "var(--color-steel)";

/* ── Movement direction helpers ── */
const IN_TYPES = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN", "SCRAP_GENERATED"];
const OUT_TYPES = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "SALE"];

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue",
  ISSUE_TO_DEPARTMENT: "Issue",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  RETURN: "Return",
  SALE: "Sale",
  SCRAP_GENERATED: "Scrap Gen",
};

const movementLabel = (type: string): string =>
  MOVEMENT_LABELS[type] ?? type.replace(/_/g, " ");

const movementIcon = (type: string): LucideIcon =>
  IN_TYPES.includes(type) ? ArrowDownToLine : OUT_TYPES.includes(type) ? ArrowUpFromLine : ArrowLeftRight;

const movementColor = (type: string): string =>
  IN_TYPES.includes(type) ? "var(--color-go)" : OUT_TYPES.includes(type) ? "var(--color-stop)" : "var(--color-steel)";

/**
 * Field inventory view — "what's on the ground".
 * Shows location bin cards with material breakdowns, quick actions,
 * and a compact recent activity strip.
 */
export function MobileSiteStockList({
  locations,
  movements,
  totalItems,
  totalUnits,
}: {
  locations: StockLocationItem[];
  movements: StockMovementItem[];
  totalItems: number;
  totalUnits: number;
}) {
  const [query, setQuery] = useState("");

  const filteredLocations = useMemo(() => {
    if (!query.trim()) return locations;
    const q = query.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.items.some((i) => i.materialName.toLowerCase().includes(q)),
    );
  }, [locations, query]);

  const filteredMovements = useMemo(() => {
    if (!query.trim()) return movements;
    const q = query.toLowerCase();
    return movements.filter(
      (m) =>
        m.materialName.toLowerCase().includes(q) ||
        (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
        (m.toLocationName?.toLowerCase().includes(q) ?? false),
    );
  }, [movements, query]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Locations
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(locations.length, 0)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Items
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(totalItems, 0)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Units
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(totalUnits, 0)}
          </p>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link
          href="/m/site/issue"
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <ArrowUpFromLine className="size-3.5" style={{ color: "var(--color-stop)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              Issue Material
            </p>
            <p className="text-[0.5rem] leading-tight" style={{ color: "var(--color-ink-500)" }}>
              Material challan out
            </p>
          </div>
        </Link>
        <Link
          href="/m/site/receive"
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Truck className="size-3.5" style={{ color: "var(--color-go)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              Receive Stock
            </p>
            <p className="text-[0.5rem] leading-tight" style={{ color: "var(--color-ink-500)" }}>
              PO / gate entry
            </p>
          </div>
        </Link>
      </div>

      {/* ── Sticky search header ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location or material…"
            className="w-full h-8 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] focus:outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-5"
            >
              <X className="size-3" style={{ color: "var(--color-ink-500)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Location bin cards ── */}
      {filteredLocations.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Package className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query.trim() ? "No matching locations" : "No stock locations"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query.trim() ? "Try a different search" : "Stock locations will appear here"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {filteredLocations.map((loc) => (
            <LocationBinCard key={loc.id} loc={loc} />
          ))}
        </div>
      )}

      {/* ── Recent activity ── */}
      {filteredMovements.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Recent Activity
            </span>
            <Link
              href="/m/stock"
              className="flex items-center gap-0.5 text-[0.5625rem] font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              View ledger <ArrowRight className="size-2.5" />
            </Link>
          </div>
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {filteredMovements.map((m, i) => {
              const Icon = movementIcon(m.movementType);
              const color = movementColor(m.movementType);
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2.5 py-1.5"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <span
                    className="grid place-items-center size-6 rounded-full shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                  >
                    <Icon className="size-3" style={{ color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {formatNumber(m.qty, 0)} {m.materialUnit} {m.materialName}
                    </p>
                    <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                      {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[0.5rem] font-semibold" style={{ color }}>
                      {movementLabel(m.movementType)}
                    </p>
                    <p className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {formatTime(m.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Location bin card — procurement-style card with type accent + material list ─── */
function LocationBinCard({ loc }: { loc: StockLocationItem }) {
  const accentColor = typeColor(loc.type);
  const visibleItems = loc.items.slice(0, 3);
  const remaining = loc.items.length - visibleItems.length;

  return (
    <Link
      href={`/m/stock?locationId=${loc.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Location name + type label */}
        <div className="flex items-center justify-between gap-1">
          <p className="text-[0.625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {loc.name}
          </p>
          <span
            className="text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {typeLabel(loc.type)}
          </span>
        </div>

        {/* Row 2: Material rows — fixed height for equal card sizes */}
        <div className="flex flex-col gap-0.5 h-[2.625rem]">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div key={item.materialId} className="flex items-baseline justify-between gap-1">
                <span className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-700)" }}>
                  {item.materialName}
                </span>
                <span className="text-[0.5625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(item.qty, 0)}
                  <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>
                    {item.unit}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
              Empty
            </p>
          )}
        </div>

        {/* Row 3: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[0.875rem] flex items-center">
          {remaining > 0 ? (
            <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
              +{remaining} more item{remaining > 1 ? "s" : ""}
            </span>
          ) : loc.items.length > 0 ? (
            <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
              {loc.itemCount} item{loc.itemCount !== 1 ? "s" : ""} · {formatNumber(loc.totalQty, 0)} units
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
