"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ScanLine, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterDropdown,
  MobileHeaderAction,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";

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
      <MobileSummaryStrip
        stats={[
          { label: "Pending", value: String(counts.draft + counts.counted), tone: "signal" },
          { label: "Drafts", value: String(counts.draft), tone: "signal" },
          { label: "Reconciled", value: String(counts.reconciled), tone: "go" },
          { label: "Total", value: String(counts.total), tone: "default" },
        ]}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search location…"
        action={
          <>
            <MobileFilterDropdown
              label="All"
              options={FILTER_OPTIONS}
              active={filter}
              onChange={setFilter}
            />
            {canCreate && <MobileHeaderAction href="/m/stock-counts/new">New</MobileHeaderAction>}
          </>
        }
        showClear={filter !== "ALL" || query !== ""}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* ── Count cards grid ── */}
      {filtered.length === 0 ? (
        (query || filter !== "ALL") ? (
          <MobileNoResults title="No matching counts" hint="Try a different search or filter" />
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            <ScanLine className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
              No stock counts
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
              Start a physical verification
            </p>
          </div>
        )
      ) : (
        <MobileCardGrid>
          {filtered.map((c) => (
            <CountCard key={c.id} c={c} />
          ))}
        </MobileCardGrid>
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
