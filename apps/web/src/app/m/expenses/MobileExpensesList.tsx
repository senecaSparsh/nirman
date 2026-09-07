"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Receipt, Plus, Share2, Calendar, Tag, IndianRupee, CreditCard, Building2, FileText } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
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
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

export type ExpenseListItem = {
  id: string;
  category: string;
  amount: number;
  date: string;
  projectName: string | null;
  notes: string | null;
  status: string;
  paymentMode: string | null;
  payeeName: string | null;
  supplierName: string | null;
  receiptUrl: string | null;
};

/**
 * Expense log — "what did we spend, and on which project?"
 * Finance-style cards in a 2-col grid with amount accent.
 */
export function MobileExpensesList({
  items: initialItems,
  totalAmount,
  categoryCount,
  canCreate,
  loadMoreUrl,
  initialCursor,
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
  loadMoreUrl?: string;
  initialCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const { items, loading, hasMore, loadMore } = usePaginatedList<ExpenseListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

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
              href="/m/books/finance"
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

      {loadMoreUrl ? (
        <MobileLoadMore
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          count={items.length}
        />
      ) : null}
    </div>
  );
}

/* ─── Expense card — finance-style with amount accent ─── */

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--color-ink-500)",
  PENDING: "var(--color-hold)",
  APPROVED: "var(--color-go)",
  REJECTED: "var(--color-stop)",
};

function ExpenseCard({ e }: { e: ExpenseListItem }) {
  const statusColor = STATUS_COLOR[e.status] ?? "var(--color-ink-500)";

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: Calendar, label: "Date", value: formatDate(e.date) },
    { icon: Tag, label: "Category", value: e.category },
    { icon: IndianRupee, label: "Amount", value: formatCurrency(e.amount), valueColor: "var(--color-stop)" },
    { icon: CreditCard, label: "Payment Mode", value: e.paymentMode ?? "—" },
    { icon: Building2, label: "Vendor", value: e.supplierName ?? e.payeeName ?? "—" },
    { icon: Building2, label: "Department", value: e.projectName ?? "—" },
    { icon: Receipt, label: "Status", value: e.status, valueColor: statusColor },
    { icon: FileText, label: "Notes", value: e.notes ?? "—" },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/expenses`;
        if (navigator.share) {
          navigator.share({ title: `${e.category} — ${formatCurrency(e.amount)}`, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <div
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Top accent strip — colored by status */}
          <div className="h-0.5 w-full" style={{ backgroundColor: statusColor }} />

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

            {/* Row 2: Date + status dot */}
            <div className="flex items-center gap-1.5">
              <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                {formatDate(e.date)}
              </span>
              <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: statusColor }}>
                {e.status}
              </span>
            </div>

            {/* Row 3: Payee / vendor */}
            {(e.supplierName || e.payeeName) && (
              <span className="text-m-caption font-semibold truncate" style={{ color: "var(--color-steel)" }}>
                {e.supplierName ?? e.payeeName}
              </span>
            )}

            {/* Row 4: Project name */}
            {e.projectName ? (
              <span className="text-m-caption font-semibold truncate" style={{ color: "var(--color-steel)" }}>
                {e.projectName}
              </span>
            ) : null}

            {/* Row 5: Payment mode */}
            {e.paymentMode && (
              <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-400)" }}>
                {e.paymentMode}
              </span>
            )}

            {/* Row 6: Notes (truncated) */}
            <div className="mt-auto pt-1 min-h-[0.875rem] flex items-center">
              {e.notes ? (
                <span className="text-m-caption leading-tight line-clamp-2" style={{ color: "var(--color-ink-500)" }}>
                  {e.notes}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={e.category}
        subtitle={formatCurrency(e.amount)}
        accentColor={statusColor}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
