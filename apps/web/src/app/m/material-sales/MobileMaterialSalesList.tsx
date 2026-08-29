"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TrendingUp, Eye, Copy, Share2, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { InteractiveListItem } from "@/components/mobile/v2/interactive-list-item";
import { PageLead, NextActionCard } from "@/components/mobile/v2/guidance";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

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
  items: initialItems,
  totalRevenue,
  totalProfit,
  pendingCount,
  pendingSaleCount = 0,
  canCreate,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: MaterialSaleItem[];
  totalRevenue: number;
  totalProfit: number;
  pendingCount: number;
  pendingSaleCount?: number;
  canCreate: boolean;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SaleFilter>("ALL");
  const router = useRouter();

  const { items, loading, hasMore, loadMore } = usePaginatedList<MaterialSaleItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "ACTIVE")
      result = result.filter((s) => s.status === "ACTIVE");
    else if (filter === "CANCELLED")
      result = result.filter((s) => s.status === "CANCELLED");
    else if (filter === "PENDING")
      result = result.filter(
        (s) => s.paymentStatus === "PENDING" && s.status === "ACTIVE",
      );
    else if (filter === "PAID")
      result = result.filter(
        (s) => s.paymentStatus === "PAID" && s.status === "ACTIVE",
      );
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

  const summaryStats: SummaryStat[] = [
    { label: "Revenue", value: formatCurrency(totalRevenue), tone: "go" },
    {
      label: "Profit",
      value: formatCurrency(totalProfit),
      tone: totalProfit >= 0 ? "go" : "stop",
    },
    {
      label: "Unpaid",
      value: String(pendingCount),
      tone: pendingCount > 0 ? "signal" : "default",
    },
  ];

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Orientation: what is this page + what to do next ── */}
      <PageLead flow="materialSale" />
      <NextActionCard
        flow="materialSale"
        count={pendingSaleCount}
        can={(perm) => perm === "SALE_CREATE" ? canCreate : false}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search sale, customer, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={filter}
              defaultValue="ALL"
              onChange={(v) => setFilter(v as SaleFilter)}
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
        showClear={filter !== "ALL" || !!query}
        onClear={() => {
          setQuery("");
          setFilter("ALL");
        }}
      />

      {/* ── Sales cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={
            query || filter !== "ALL"
              ? "No matching sales"
              : "No material sales"
          }
          hint={
            query || filter !== "ALL"
              ? "Try a different search or filter"
              : "Sell surplus or scrap material"
          }
        />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} sale{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid cols={2}>
            {filtered.map((s) => (
              <SaleCard key={s.id} s={s} onAction={() => router.refresh()} />
            ))}
          </MobileCardGrid>
          {loadMoreUrl ? (
            <MobileLoadMore
              onClick={loadMore}
              loading={loading}
              hasMore={hasMore}
              count={items.length}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─── Sale card — procurement-style with payment status accent ─── */
function SaleCard({ s, onAction }: { s: MaterialSaleItem; onAction?: () => void }) {
  const router = useRouter();
  const isCancelled = s.status === "CANCELLED";
  const isPending = s.paymentStatus === "PENDING" && !isCancelled;

  // Accent: green=paid, signal=pending, stop=cancelled
  const accentColor = isCancelled
    ? "var(--color-stop)"
    : isPending
      ? "var(--color-signal)"
      : "var(--color-go)";

  const statusLabel = isCancelled ? "Cancelled" : isPending ? "Unpaid" : "Paid";

  // Context menu actions
  const contextActions: ContextAction[] = [
    { label: "View Details", icon: Eye, onPress: () => router.push(`/m/material-sales/${s.id}`) },
    ...(isPending
      ? [{ label: "Record Payment", icon: IndianRupee, color: "var(--color-go)", onPress: () => router.push(`/m/material-sales/${s.id}`) }]
      : []),
    {
      label: "Copy Number",
      icon: Copy,
      onPress: () => {
        navigator.clipboard?.writeText(s.saleNumber).catch(() => {});
        toast.success(`Copied ${s.saleNumber}`);
      },
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/material-sales/${s.id}`;
        if (navigator.share) {
          navigator.share({ title: s.saleNumber, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <InteractiveListItem
      contextActions={contextActions}
      menuTitle={s.saleNumber}
      menuSubtitle={s.customerName ?? undefined}
      className="rounded-[0.625rem]"
    >
    <Link
      href={`/m/material-sales/${s.id}`}
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
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
          <span
            className="text-m-caption font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {s.saleNumber}
          </span>
          <span
            className="text-m-caption font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Row 2: Customer name */}
        <p
          className="text-m-caption font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {s.customerName ?? "Walk-in customer"}
        </p>

        {/* Row 3: Date + project */}
        <div className="flex items-center gap-1">
          <span
            className="text-m-caption tabular-nums"
            style={{ color: "var(--color-ink-500)" }}
          >
            {formatDate(s.saleDate)}
          </span>
          {s.projectName ? (
            <>
              <span style={{ color: "var(--color-line)" }}>·</span>
              <span
                className="text-m-caption truncate"
                style={{ color: "var(--color-ink-500)" }}
              >
                {s.projectName}
              </span>
            </>
          ) : null}
        </div>

        {/* Row 4: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
          <div className="flex items-center justify-between">
            <span
              className="text-m-caption font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              {s.lineCount} item{s.lineCount !== 1 ? "s" : ""}
            </span>
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatCurrencyCompact(s.totalAmount)}
            </span>
          </div>
          {s.grossProfit !== 0 && !isCancelled ? (
            <div className="flex items-center gap-0.5">
              <TrendingUp
                className="size-2"
                style={{
                  color:
                    s.grossProfit >= 0
                      ? "var(--color-go)"
                      : "var(--color-stop)",
                }}
              />
              <span
                className="text-m-caption font-bold tabular-nums"
                style={{
                  color:
                    s.grossProfit >= 0
                      ? "var(--color-go)"
                      : "var(--color-stop)",
                }}
              >
                {s.grossProfit >= 0 ? "+" : ""}
                {formatCurrencyCompact(s.grossProfit)}
              </span>
              {s.scrapSubtotal > 0 ? (
                <span
                  className="text-m-caption font-semibold"
                  style={{ color: "var(--color-steel)" }}
                >
                  · scrap
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
    </InteractiveListItem>
  );
}
