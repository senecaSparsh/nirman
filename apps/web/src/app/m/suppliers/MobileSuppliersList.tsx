"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, ChevronDown, Truck, Phone, Plus } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

type DuesFilter = "ALL" | "DUE" | "CLEAR";

export type SupplierListItem = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  poCount: number;
  balanceOwed: number;
};

const FILTER_OPTIONS: { label: string; value: DuesFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "With Dues", value: "DUE" },
  { label: "Clear", value: "CLEAR" },
];

/**
 * Supplier directory — "who do I owe, and how active are they?"
 * Procurement-style cards in a 2-col grid with dues accent.
 */
export function MobileSuppliersList({
  items,
  totalOwed,
  withDuesCount,
  canCreate,
}: {
  items: SupplierListItem[];
  totalOwed: number;
  withDuesCount: number;
  canCreate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [duesFilter, setDuesFilter] = useState<DuesFilter>("ALL");
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
    if (duesFilter === "DUE") {
      result = result.filter((s) => s.balanceOwed > 0);
    } else if (duesFilter === "CLEAR") {
      result = result.filter((s) => s.balanceOwed === 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.gstin?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false),
      );
    }
    // Sort: dues first (by amount desc), then rest by name
    return [...result].sort((a, b) => {
      if (a.balanceOwed > 0 && b.balanceOwed === 0) return -1;
      if (a.balanceOwed === 0 && b.balanceOwed > 0) return 1;
      if (a.balanceOwed > 0 && b.balanceOwed > 0) return b.balanceOwed - a.balanceOwed;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, duesFilter]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total Owed
          </p>
          <p
            className="text-[0.875rem] font-bold tabular-nums"
            style={{ color: totalOwed > 0 ? "var(--color-stop)" : "var(--color-ink-950)" }}
          >
            {formatCurrency(totalOwed)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            With Dues
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {withDuesCount}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Suppliers
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {items.length}
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
              placeholder="Search supplier, GSTIN, phone…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Dues filter selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="h-8 rounded-[0.5rem] border pl-2 pr-5 text-[0.625rem] font-semibold focus:outline-none cursor-pointer truncate max-w-[5rem] flex items-center"
              style={{
                borderColor: duesFilter !== "ALL" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            >
              <span className="truncate">
                {FILTER_OPTIONS.find(f => f.value === duesFilter)?.label ?? "All"}
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
                    onClick={() => { setDuesFilter(opt.value); setShowFilter(false); }}
                    className="w-full text-left px-2.5 py-1.5 text-[0.625rem] font-semibold"
                    style={
                      duesFilter === opt.value
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
        </div>

        {/* Clear button */}
        {(duesFilter !== "ALL" || query) ? (
          <button
            onClick={() => { setQuery(""); setDuesFilter("ALL"); }}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Supplier cards grid ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Truck className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query || duesFilter !== "ALL" ? "No matching suppliers" : "No suppliers"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query || duesFilter !== "ALL"
              ? "Try a different search or filter"
              : canCreate
                ? "Tap + to add your first supplier"
                : "Suppliers will appear here once added"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((s) => (
            <SupplierCard key={s.id} s={s} />
          ))}
        </div>
      )}

      {/* ── New supplier FAB ── */}
      {canCreate ? (
        <Link
          href="/m/suppliers/new"
          className="fixed bottom-20 right-4 z-30 flex items-center justify-center size-12 rounded-full shadow-lg press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          <Plus className="size-5" />
        </Link>
      ) : null}
    </div>
  );
}

/* ─── Supplier card — procurement-style with dues accent ─── */
function SupplierCard({ s }: { s: SupplierListItem }) {
  const hasDues = s.balanceOwed > 0;
  const accentColor = hasDues ? "var(--color-stop)" : "var(--color-steel)";

  return (
    <Link
      href={`/m/suppliers/${s.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Name + dues badge */}
        <div className="flex items-center justify-between gap-1">
          <p className="text-[0.625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {s.name}
          </p>
          <span
            className="text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {hasDues ? "Due" : "Clear"}
          </span>
        </div>

        {/* Row 2: PO count + phone */}
        <div className="flex items-center gap-1.5">
          <span className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
            {s.poCount} Purchase Order{s.poCount !== 1 ? "s" : ""}
          </span>
          {s.phone ? (
            <>
              <span style={{ color: "var(--color-line)" }}>·</span>
              <span className="text-[0.5rem] truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                <Phone className="size-2" />
                {s.phone}
              </span>
            </>
          ) : null}
        </div>

        {/* Row 3: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1rem] flex items-center">
          {hasDues ? (
            <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
              {formatCurrencyCompact(s.balanceOwed)}
            </span>
          ) : (
            <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
              No outstanding dues
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
