"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, Plus, ChevronDown, TrendingUp, IndianRupee } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";

type SaleFilter = "ALL" | "ACTIVE" | "PENDING" | "PAID" | "CANCELLED";

export type MaterialSaleItem = {
  id: string;
  saleNumber: string;
  status: string;
  paymentStatus: string;
  saleDate: string;
  totalAmount: number;
  grossProfit: number;
  scrapSubtotal: number;
  customerName: string | null;
  projectName: string | null;
  lineCount: number;
};

const FILTER_OPTIONS: { label: string; value: SaleFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending Pay", value: "PENDING" },
  { label: "Paid", value: "PAID" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Material sales list — "what did we sell, and did we get paid?"
 * Procurement-style cards in a 2-col grid with payment status accent.
 */
export function MobileMaterialSalesList({
  items,
  totalRevenue,
  totalProfit,
  pendingCount,
  canCreate,
}: {
  items: MaterialSaleItem[];
  totalRevenue: number;
  totalProfit: number;
  pendingCount: number;
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SaleFilter>("ALL");
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
    if (filter === "ACTIVE") result = result.filter((s) => s.status === "ACTIVE");
    else if (filter === "CANCELLED") result = result.filter((s) => s.status === "CANCELLED");
    else if (filter === "PENDING") result = result.filter((s) => s.paymentStatus === "PENDING" && s.status === "ACTIVE");
    else if (filter === "PAID") result = result.filter((s) => s.paymentStatus === "PAID" && s.status === "ACTIVE");
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.saleNumber.toLowerCase().includes(q) ||
          (s.customerName?.toLowerCase().includes(q) ?? false) ||
          (s.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
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
            Revenue
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Profit
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: totalProfit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}>
            {formatCurrency(totalProfit)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Unpaid
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: pendingCount > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}>
            {pendingCount}
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
              placeholder="Search sale, customer, project…"
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
              href="/m/material-sales/new"
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

      {/* ── Sales cards grid ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <IndianRupee className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query || filter !== "ALL" ? "No matching sales" : "No material sales"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query || filter !== "ALL" ? "Try a different search or filter" : "Sell surplus or scrap material"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((s) => (
            <SaleCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sale card — procurement-style with payment status accent ─── */
function SaleCard({ s }: { s: MaterialSaleItem }) {
  const isCancelled = s.status === "CANCELLED";
  const isPending = s.paymentStatus === "PENDING" && !isCancelled;

  // Accent: green=paid, signal=pending, stop=cancelled
  const accentColor = isCancelled
    ? "var(--color-stop)"
    : isPending
      ? "var(--color-signal)"
      : "var(--color-go)";

  const statusLabel = isCancelled ? "Cancelled" : isPending ? "Unpaid" : "Paid";

  return (
    <Link
      href={`/m/material-sales/${s.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        ...(isCancelled ? { opacity: 0.6 } : {}),
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Sale number + status badge */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[0.5625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {s.saleNumber}
          </span>
          <span
            className="text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Row 2: Customer name */}
        <p className="text-[0.5625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {s.customerName ?? "Walk-in customer"}
        </p>

        {/* Row 3: Date + project */}
        <div className="flex items-center gap-1">
          <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(s.saleDate)}
          </span>
          {s.projectName ? (
            <>
              <span style={{ color: "var(--color-line)" }}>·</span>
              <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {s.projectName}
              </span>
            </>
          ) : null}
        </div>

        {/* Row 4: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
          <div className="flex items-center justify-between">
            <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
              {s.lineCount} item{s.lineCount !== 1 ? "s" : ""}
            </span>
            <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(s.totalAmount)}
            </span>
          </div>
          {s.grossProfit !== 0 && !isCancelled ? (
            <div className="flex items-center gap-0.5">
              <TrendingUp className="size-2" style={{ color: s.grossProfit >= 0 ? "var(--color-go)" : "var(--color-stop)" }} />
              <span
                className="text-[0.4375rem] font-bold tabular-nums"
                style={{ color: s.grossProfit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}
              >
                {s.grossProfit >= 0 ? "+" : ""}{formatCurrencyCompact(s.grossProfit)}
              </span>
              {s.scrapSubtotal > 0 ? (
                <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-steel)" }}>
                  · scrap
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
