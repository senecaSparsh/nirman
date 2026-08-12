"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, Plus, ChevronDown, ScanLine, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";

type CountFilter = "ALL" | "DRAFT" | "COUNTED" | "RECONCILED";

export type StockCountItem = {
  id: string;
  status: string;
  countDate: string;
  createdAt: string;
  locationId: string;
  locationName: string;
  locationType: string;
  lineCount: number;
  totalVariance: number;
  itemsWithVariance: number;
};

const FILTER_OPTIONS: { label: string; value: CountFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Counted", value: "COUNTED" },
  { label: "Reconciled", value: "RECONCILED" },
];

/**
 * Stock counts list — "what needs counting, and what discrepancies exist?"
 * Procurement-style cards in a 2-col grid with status accent.
 * Smart sort: drafts first (action needed), then counted (pending reconcile),
 * then reconciled (most recent first).
 */
export function MobileStockCountsList({
  items,
  counts,
  canCreate,
}: {
  items: StockCountItem[];
  counts: { total: number; draft: number; counted: number; reconciled: number };
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CountFilter>("ALL");
  const [showFilter, setShowFilter] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilter) return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((c) => c.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.locationName.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q),
      );
    }
    // Smart sort: DRAFT > COUNTED > RECONCILED, then by date desc
    const statusOrder: Record<string, number> = { DRAFT: 0, COUNTED: 1, RECONCILED: 2 };
    return [...result].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (so !== 0) return so;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items, query, filter]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Pending
          </p>
          <p
            className="text-[0.875rem] font-bold tabular-nums"
            style={{ color: counts.draft + counts.counted > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}
          >
            {counts.draft + counts.counted}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Drafts
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: counts.draft > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}>
            {counts.draft}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Reconciled
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {counts.reconciled}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {counts.total}
          </p>
        </div>
      </div>

      {/* ── Sticky search header ── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search location…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Filter selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="h-8 rounded-[0.5rem] border pl-2 pr-5 text-[0.625rem] font-semibold focus:outline-none cursor-pointer truncate max-w-[5.5rem] flex items-center"
              style={{
                borderColor: filter !== "ALL" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            >
              <span className="truncate">
                {FILTER_OPTIONS.find(f => f.value === filter)?.label ?? "All"}
              </span>
            </button>
            <ChevronDown
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 size-3"
              style={{ color: "var(--color-ink-500)" }}
            />
            {showFilter ? (
              <div
                className="absolute top-9 right-0 z-30 rounded-[0.5rem] border shadow-lg overflow-hidden min-w-[7rem]"
                style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
              >
                {FILTER_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => { setFilter(opt.value); setShowFilter(false); }}
                    className="w-full text-left px-2.5 py-1.5 text-[0.625rem] font-semibold"
                    style={
                      filter === opt.value
                        ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
                        : { color: "var(--color-ink-700)", ...(i > 0 ? { borderTop: "1px solid var(--color-line)" } : {}) }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {canCreate ? (
            <Link
              href="/m/stock-counts/new"
              className="h-8 shrink-0 rounded-[0.5rem] px-2.5 flex items-center gap-1 text-[0.625rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <Plus className="size-3" />
              New
            </Link>
          ) : null}
        </div>

        {(filter !== "ALL" || query) ? (
          <button
            onClick={() => { setQuery(""); setFilter("ALL"); }}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Count cards grid ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <ScanLine className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query || filter !== "ALL" ? "No matching counts" : "No stock counts"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query || filter !== "ALL" ? "Try a different search or filter" : "Start a physical verification"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((c) => (
            <CountCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Count card — procurement-style with status accent ─── */
function CountCard({ c }: { c: StockCountItem }) {
  const isDraft = c.status === "DRAFT";
  const isCounted = c.status === "COUNTED";

  // Accent: signal=draft (action needed), steel=counted (pending reconcile), go=reconciled
  const accentColor = isDraft
    ? "var(--color-signal)"
    : isCounted
      ? "var(--color-steel)"
      : "var(--color-go)";

  const StatusIcon = isDraft ? Clock : isCounted ? AlertTriangle : CheckCircle2;
  const statusLabel = isDraft ? "Draft" : isCounted ? "Counted" : "Reconciled";

  const hasVariance = c.itemsWithVariance > 0;
  const varianceColor = c.totalVariance < 0 ? "var(--color-stop)" : c.totalVariance > 0 ? "var(--color-signal)" : "var(--color-go)";

  return (
    <Link
      href={`/m/stock-counts/${c.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Status badge */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="flex items-center gap-0.5 text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            <StatusIcon className="size-2.5" />
            {statusLabel}
          </span>
          <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
            {c.lineCount} items
          </span>
        </div>

        {/* Row 2: Location name */}
        <p className="text-[0.5625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {c.locationName}
        </p>

        {/* Row 3: Date */}
        <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {formatDate(c.countDate)}
        </span>

        {/* Row 4: Variance indicator (fixed height) */}
        <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
          {hasVariance ? (
            <div className="flex items-center justify-between">
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                {c.itemsWithVariance} mismatch
              </span>
              <span
                className="text-[0.5625rem] font-bold tabular-nums"
                style={{ color: varianceColor }}
              >
                {c.totalVariance > 0 ? "+" : ""}{formatNumber(c.totalVariance, 0)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                All match
              </span>
              <CheckCircle2 className="size-3" style={{ color: "var(--color-go)" }} />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
