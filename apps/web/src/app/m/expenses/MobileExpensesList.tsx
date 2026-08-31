"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Receipt, Plus } from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export type ExpenseListItem = {
  id: string;
  category: string;
  amount: number;
  date: string;
  projectName: string | null;
  notes: string | null;
};

/**
 * Expense log — "what did we spend, and on which project?"
 * Finance-style cards in a 2-col grid with amount accent.
 */
export function MobileExpensesList({
  items,
  totalAmount,
  categoryCount,
  canCreate,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ExpenseListItem[];
  totalAmount: number;
  categoryCount: number;
  canView?: boolean;
  canCreate?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const categories = useMemo(() => {
    const set = new Set(items.map((e) => e.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filterOptions = useMemo(
    () => [
      { label: "All", value: "ALL" },
      ...categories.map((c) => ({ label: c, value: c })),
    ],
    [categories],
  );

  const filtered = useMemo(() => {
    let result = items;
    if (categoryFilter !== "ALL") {
      result = result.filter((e) => e.category === categoryFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.category.toLowerCase().includes(q) ||
          (e.notes?.toLowerCase().includes(q) ?? false) ||
          (e.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...result].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (db !== da) return db - da;
      return b.amount - a.amount;
    });
  }, [items, query, categoryFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Total Spent", value: formatCurrencyCompact(totalAmount), tone: totalAmount > 0 ? "stop" : "default" },
    { label: "Expenses", value: String(items.length) },
    { label: "Categories", value: String(categoryCount) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Receipt}
        title="No expenses yet"
        hint="Record an expense to track spending"
        action={
          canCreate ? (
            <Link
              href="/m/books/gl"
              className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3.5" /> Record Expense
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search category, notes, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={filterOptions}
              active={categoryFilter}
              defaultValue="ALL"
              onChange={setCategoryFilter}
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
        showClear={categoryFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setCategoryFilter("ALL"); }}
      />

      {/* ── Expense cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || categoryFilter !== "ALL" ? "No matching expenses" : "No expenses"}
          hint={query || categoryFilter !== "ALL"
            ? "Try a different search or filter"
            : canCreate
              ? "Expenses are created from the Books page"
              : "Expenses will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((e) => (
            <ExpenseCard key={e.id} e={e} />
          ))}
        </MobileCardGrid>
      )}
    </div>
  );
}

/* ─── Expense card — finance-style with amount accent ─── */
function ExpenseCard({ e }: { e: ExpenseListItem }) {
  return (
    <div
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: "var(--color-steel)" }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Category + amount */}
        <div className="flex items-center justify-between gap-1">
          <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {e.category}
          </p>
          <span
            className="text-m-caption font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-stop)" }}
          >
            {formatCurrencyCompact(e.amount)}
          </span>
        </div>

        {/* Row 2: Date */}
        <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
          {formatDate(e.date)}
        </span>

        {/* Row 3: Project name */}
        {e.projectName ? (
          <span className="text-m-caption font-semibold truncate" style={{ color: "var(--color-steel)" }}>
            {e.projectName}
          </span>
        ) : null}

        {/* Row 4: Notes (truncated) */}
        <div className="mt-auto pt-1 min-h-[0.875rem] flex items-center">
          {e.notes ? (
            <span className="text-m-caption leading-tight line-clamp-2" style={{ color: "var(--color-ink-500)" }}>
              {e.notes}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
