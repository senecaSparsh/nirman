"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Search, X, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";

export type StockLocation = {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  totalQty: number;
  totalValue: number;
};

export type StockMovementItem = {
  id: string;
  movementType: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  qty: number;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  timestamp: string;
};

export type MaterialStockItem = {
  locationId: string;
  locationName: string;
  qty: number;
  unit: string;
};

/* ── Movement type helpers ── */
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

type MovementFilter =
  | "ALL" | "RECEIPT" | "TRANSFER" | "ISSUE"
  | "SCRAP" | "ADJUSTMENT" | "SALE" | "RETURN";

const FILTER_CHIPS: { label: string; value: MovementFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Receipt", value: "RECEIPT" },
  { label: "Transfer", value: "TRANSFER" },
  { label: "Issue", value: "ISSUE" },
  { label: "Scrap", value: "SCRAP" },
  { label: "Adjustment", value: "ADJUSTMENT" },
  { label: "Sale", value: "SALE" },
  { label: "Return", value: "RETURN" },
];

const TYPE_TO_FILTER: Record<string, MovementFilter> = {
  PURCHASE_RECEIPT: "RECEIPT",
  TRANSFER_IN: "TRANSFER", TRANSFER_OUT: "TRANSFER",
  ISSUE_TO_PROJECT: "ISSUE", ISSUE_TO_DEPARTMENT: "ISSUE",
  SCRAP_GENERATED: "SCRAP",
  ADJUSTMENT_IN: "ADJUSTMENT", ADJUSTMENT_OUT: "ADJUSTMENT",
  SALE: "SALE", RETURN: "RETURN",
};

export function MobileStockMovementsList({
  locations,
  movements,
  totalInventoryValue,
  filterMaterialName,
  materialStockItems,
}: {
  locations: StockLocation[];
  movements: StockMovementItem[];
  totalInventoryValue: number;
  filterMaterialName: string | null;
  materialStockItems: MaterialStockItem[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MovementFilter>("ALL");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTypeDropdown) return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTypeDropdown]);

  const filtered = useMemo(() => {
    let result = movements;
    if (filter !== "ALL") {
      result = result.filter((m) => TYPE_TO_FILTER[m.movementType] === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m) =>
          m.materialName.toLowerCase().includes(q) ||
          movementLabel(m.movementType).toLowerCase().includes(q) ||
          (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
          (m.toLocationName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [movements, query, filter]);

  // Date grouping
  const grouped = useMemo(() => {
    const today = newDate();
    const yesterday = newDate(); yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: StockMovementItem[] }[] = [];
    const map = new Map<string, StockMovementItem[]>();
    for (const m of filtered) {
      const mDate = new Date(m.timestamp);
      const label = sameDay(mDate, today) ? "Today"
        : sameDay(mDate, yesterday) ? "Yesterday"
        : formatDate(m.timestamp);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(m);
    }
    for (const [label, items] of map) groups.push({ label, items });
    return groups;
  }, [filtered]);

  return (
    <div>
      {/* ── Inventory summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Inventory Value
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(totalInventoryValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Locations
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {locations.length}
          </p>
        </div>
      </div>

      {/* ── Material filter label (when deep-linked) ── */}
      {filterMaterialName ? (
        <div
          className="rounded-[0.5rem] px-3 py-2 mb-3 text-[0.75rem] font-semibold"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          Filtering by: {filterMaterialName}
        </div>
      ) : null}

      {/* ── Material stock by location (when deep-linked by material) ── */}
      {filterMaterialName && materialStockItems.length > 0 ? (
        <div className="mb-3">
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--color-steel)" }}>
            On Hand by Location
          </p>
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {materialStockItems.map((item, i) => (
              <Link
                key={item.locationId}
                href={`/m/stock?locationId=${item.locationId}`}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 press"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <span className="text-[0.625rem] font-semibold truncate" style={{ color: "var(--color-ink-700)" }}>
                  {item.locationName}
                </span>
                <span className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(item.qty, 0)} {item.unit}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Sticky search header ── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        {/* Search + type selector in one row */}
        <div className="flex items-center gap-1.5">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search material, type, location…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Type selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowTypeDropdown(v => !v)}
              className="h-8 rounded-[0.5rem] border pl-2 pr-5 text-[0.625rem] font-semibold focus:outline-none cursor-pointer truncate max-w-[5rem] flex items-center"
              style={{
                borderColor: filter !== "ALL" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            >
              <span className="truncate">{FILTER_CHIPS.find(c => c.value === filter)?.label ?? "All"}</span>
            </button>
            <ChevronDown
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 size-3"
              style={{ color: "var(--color-ink-500)" }}
            />
            {showTypeDropdown ? (
              <div
                className="absolute top-9 right-0 z-30 rounded-[0.5rem] border shadow-lg overflow-hidden min-w-[7rem]"
                style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
              >
                {FILTER_CHIPS.map((chip, i) => (
                  <button
                    key={chip.value}
                    onClick={() => { setFilter(chip.value); setShowTypeDropdown(false); }}
                    className="w-full text-left px-2.5 py-1.5 text-[0.625rem] font-semibold"
                    style={filter === chip.value ? { backgroundColor: "var(--color-ink-950)", color: "#fff" } : { color: "var(--color-ink-700)", ...(i > 0 ? { borderTop: "1px solid var(--color-line)" } : {}) }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Clear button */}
        {(filter !== "ALL" || query) ? (
          <button
            onClick={() => {
              setQuery("");
              setFilter("ALL");
            }}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Movement ledger ── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-[0.625rem] border p-4 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-[0.8125rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
            No movements
          </p>
          <p className="text-[0.6875rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {query || filter !== "ALL"
              ? "Try a different search or filter"
              : "Receipts, issues and transfers appear here"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {group.label}
                </span>
                <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  {group.items.length} entr{group.items.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              {/* Ledger rows */}
              <div
                className="rounded-[0.5rem] border overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {group.items.map((m, i) => {
                  const Icon = movementIcon(m.movementType);
                  const color = movementColor(m.movementType);
                  return (
                    <Link
                      key={m.id}
                      href={`/m/materials/${m.materialId}`}
                      className="flex items-center gap-2 px-2.5 py-2 active:opacity-70"
                      style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                    >
                      {/* Direction icon */}
                      <div className="shrink-0 w-7 h-7 rounded-full grid place-items-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                        <Icon className="size-3.5" style={{ color }} />
                      </div>

                      {/* Main content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                          {formatNumber(m.qty, 0)} {m.materialUnit} {m.materialName}
                        </p>
                        <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                          {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
                        </p>
                      </div>

                      {/* Right: type + time */}
                      <div className="text-right shrink-0">
                        <p className="text-[0.5625rem] font-bold" style={{ color }}>
                          {movementLabel(m.movementType)}
                        </p>
                        <p className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-400)" }}>
                          {formatTime(m.timestamp)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Date/time helpers ── */
function newDate(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
