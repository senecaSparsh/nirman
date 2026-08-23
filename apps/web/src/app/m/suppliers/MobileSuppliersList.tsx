"use client";

import { useState, useMemo } from "react";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { Phone } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: SupplierListItem[];
  totalOwed: number;
  withDuesCount: number;
  canCreate?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [duesFilter, setDuesFilter] = useState<DuesFilter>("ALL");

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

  const summaryStats: SummaryStat[] = [
    { label: "Total Owed", value: formatCurrency(totalOwed), tone: totalOwed > 0 ? "stop" : "default" },
    { label: "With Dues", value: String(withDuesCount) },
    { label: "Suppliers", value: String(items.length) },
  ];

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search supplier, GSTIN, phone…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={duesFilter}
              defaultValue="ALL"
              onChange={setDuesFilter}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={duesFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setDuesFilter("ALL"); }}
      />

      {/* ── Supplier cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || duesFilter !== "ALL" ? "No matching suppliers" : "No suppliers"}
          hint={query || duesFilter !== "ALL"
            ? "Try a different search or filter"
            : canCreate
              ? "Tap + to add your first supplier"
              : "Suppliers will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((s) => (
            <SupplierCard key={s.id} s={s} />
          ))}
        </MobileCardGrid>
      )}

      {/* ── New supplier FAB ── */}
      {canCreate ? (
        <MobileFab href="/m/suppliers/new" label="Add supplier" />
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
