"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanLine, AlertTriangle, CheckCircle2, Clock, Eye, Share2, MapPin, Calendar, ClipboardList, GitCompare, User } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
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
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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
  canCreate: _canCreate,
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
    const statusOrder: Record<string, number> = {
      DRAFT: 0,
      COUNTED: 1,
      RECONCILED: 2,
    };
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
          {
            label: "Pending",
            value: String(counts.draft + counts.counted),
            tone: "signal",
          },
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
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={filter}
              defaultValue="ALL"
              onChange={setFilter}
            />
          </div>
        }
        showClear={filter !== "ALL" || query !== ""}
        onClear={() => {
          setQuery("");
          setFilter("ALL");
        }}
      />

      {/* ── Count cards grid ── */}
      {filtered.length === 0 ? (
        query || filter !== "ALL" ? (
          <MobileNoResults
            title="No matching counts"
            hint="Try a different search or filter"
          />
        ) : (
          <MobileEmptyState
            icon={ScanLine}
            title="No stock inventories"
            hint="Start a physical verification"
          />
        )
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} count{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid>
            {filtered.map((c) => (
              <CountCard key={c.id} c={c} />
            ))}
          </MobileCardGrid>
        </div>
      )}
    </div>
  );
}

/* ─── Count card — procurement-style with status accent ─── */
function CountCard({ c }: { c: StockCountItem }) {
  const router = useRouter();
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
  const varianceColor =
    c.totalVariance < 0
      ? "var(--color-stop)"
      : c.totalVariance > 0
        ? "var(--color-signal)"
        : "var(--color-go)";

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const varianceText =
    c.itemsWithVariance > 0
      ? `${c.itemsWithVariance} item${c.itemsWithVariance !== 1 ? "s" : ""} (${c.totalVariance > 0 ? "+" : ""}${formatNumber(c.totalVariance, 0)})`
      : "No variances";

  const overviewRows: OverviewRow[] = [
    { icon: StatusIcon, label: "Status", value: statusLabel, valueColor: accentColor },
    { icon: Calendar, label: "Date", value: formatDate(c.countDate) },
    { icon: MapPin, label: "Location", value: c.locationName },
    { icon: ClipboardList, label: "Items Counted", value: String(c.lineCount) },
    { icon: GitCompare, label: "Variances", value: varianceText, valueColor: hasVariance ? varianceColor : undefined },
    { icon: User, label: "Initiated By", value: "—" },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/stock-counts/${c.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/stock-counts/${c.id}`;
        if (navigator.share) {
          navigator.share({ title: c.locationName, url }).catch(() => {});
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
        <Link
          href={`/m/stock-counts/${c.id}`}
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
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
                className="flex items-center gap-0.5 text-m-caption font-bold uppercase shrink-0"
                style={{ color: accentColor }}
              >
                <StatusIcon className="size-2.5" />
                {statusLabel}
              </span>
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {c.lineCount} items
              </span>
            </div>

            {/* Row 2: Location name */}
            <p
              className="text-m-caption font-bold leading-tight truncate"
              style={{ color: "var(--color-ink-950)" }}
            >
              {c.locationName}
            </p>

            {/* Row 3: Date */}
            <span
              className="text-m-caption tabular-nums"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatDate(c.countDate)}
            </span>

            {/* Row 4: Variance indicator (fixed height) */}
            <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
              {hasVariance ? (
                <div className="flex items-center justify-between">
                  <span
                    className="text-m-caption font-semibold"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {c.itemsWithVariance} mismatch
                  </span>
                  <span
                    className="text-m-caption font-bold tabular-nums"
                    style={{ color: varianceColor }}
                  >
                    {c.totalVariance > 0 ? "+" : ""}
                    {formatNumber(c.totalVariance, 0)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span
                    className="text-m-caption font-semibold"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    All match
                  </span>
                  <CheckCircle2
                    className="size-3"
                    style={{ color: "var(--color-go)" }}
                  />
                </div>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={c.locationName}
        subtitle={statusLabel}
        accentColor={accentColor}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
