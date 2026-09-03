"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight, Package,
  CheckCircle2, Clock, AlertTriangle,
  ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { PageLead, NextActionCard } from "@/components/mobile/v2/guidance";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

export interface TransferItem {
  id: string;
  fromLocationName: string;
  fromLocationType: string;
  fromCompanyName: string | null;
  fromCompanyId: string;
  toLocationName: string;
  toLocationType: string;
  toCompanyName: string | null;
  toCompanyId: string;
  status: string;
  transferDate: string;
  createdAt: string;
  notes: string | null;
  lineCount: number;
  totalQty: number;
  materials: string[];
  isInterCompany: boolean;
  transferPriceTotal: number | null;
}

type TransferFilter = "ALL" | "PENDING" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
type DirectionFilter = "ALL" | "OUTGOING" | "INCOMING";

const FILTERS: { label: string; value: TransferFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "In Transit", value: "IN_TRANSIT" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const DIRECTION_FILTERS: { label: string; value: DirectionFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Outgoing", value: "OUTGOING" },
  { label: "Incoming", value: "INCOMING" },
];

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING: Clock,
  IN_TRANSIT: ArrowRight,
  RECEIVED: CheckCircle2,
  CANCELLED: AlertTriangle,
};

export function MobileTransfersList({
  items: initialItems,
  canCreate,
  canTransfer,
  inTransitCount = 0,
  currentCompanyId,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: TransferItem[];
  canCreate: boolean;
  canTransfer?: boolean;
  inTransitCount?: number;
  currentCompanyId: string;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransferFilter>("ALL");
  const [dirFilter, setDirFilter] = useState<DirectionFilter>("ALL");

  const { items, loading, hasMore, loadMore } = usePaginatedList<TransferItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    // Direction filter: outgoing = from current company, incoming = to current company
    if (dirFilter === "OUTGOING") result = result.filter((t) => t.fromCompanyId === currentCompanyId);
    if (dirFilter === "INCOMING") result = result.filter((t) => t.toCompanyId === currentCompanyId);
    if (filter !== "ALL") result = result.filter((t) => t.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.fromLocationName.toLowerCase().includes(q) ||
          t.toLocationName.toLowerCase().includes(q) ||
          t.materials.some((m) => m.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [items, query, filter, dirFilter, currentCompanyId]);

  const counts = {
    total: items.length,
    pending: items.filter((t) => t.status === "PENDING").length,
    inTransit: items.filter((t) => t.status === "IN_TRANSIT").length,
    received: items.filter((t) => t.status === "RECEIVED").length,
  };

  return (
    <div className="pb-6">
      {/* ── Summary strip (same position across all hub tabs) ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Total", value: String(items.length) },
          { label: "Pending", value: String(counts.pending) },
          { label: "In Transit", value: String(counts.inTransit) },
          { label: "Received", value: String(counts.received) },
        ]}
      />

      {/* ── Sticky search header (same position across all hub tabs) ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search by location or material…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={DIRECTION_FILTERS}
              active={dirFilter}
              defaultValue="ALL"
              onChange={(v) => setDirFilter(v as DirectionFilter)}
            />
            <MobileFilterIcon
              options={FILTERS}
              active={filter}
              defaultValue="ALL"
              onChange={(v) => setFilter(v as TransferFilter)}
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
        showClear={!!query || filter !== "ALL" || dirFilter !== "ALL"}
        onClear={() => { setQuery(""); setFilter("ALL"); setDirFilter("ALL"); }}
      />

      {/* ── Orientation + next action (kept, but below search so the
          search + summary strip stay in the same position across tabs) ── */}
      <PageLead flow="stockTransfer" />
      <NextActionCard
        flow="stockTransfer"
        count={inTransitCount}
        can={(perm) => perm === "STOCK_TRANSFER" ? !!canTransfer : false}
      />

      {/* ── Result count ── */}
      {(query || filter !== "ALL" || dirFilter !== "ALL") && filtered.length > 0 && (
        <div className="flex items-center justify-end mb-1.5">
          <span
            className="text-m-label font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            {filtered.length} transfer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Transfer cards ── */}
      <div className="flex flex-col gap-2">
        {filtered.map((t) => {
          const StatusIcon = STATUS_ICON[t.status] ?? Package;
          const isOutgoing = t.fromCompanyId === currentCompanyId;
          const isIncoming = t.toCompanyId === currentCompanyId;
          return (
            <Link
              key={t.id}
              href={`/m/transfers/${t.id}`}
              className="block rounded-[0.625rem] border overflow-hidden active:opacity-80 transition-opacity"
              style={{
                borderColor: isIncoming && !isOutgoing && t.status === "IN_TRANSIT"
                  ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))"
                  : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              {/* Header: from → to */}
              <div className="p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Direction badge */}
                  <span
                    className="shrink-0 rounded-full px-1.5 py-px text-m-caption font-bold uppercase tracking-wide flex items-center gap-0.5"
                    style={{
                      backgroundColor: isOutgoing ? "var(--color-signal-wash)" : "color-mix(in srgb, var(--color-go) 12%, transparent)",
                      color: isOutgoing ? "var(--color-signal-dark)" : "var(--color-go)",
                    }}
                  >
                    {isOutgoing ? <ArrowUpFromLine className="size-2" /> : <ArrowDownToLine className="size-2" />}
                    {isOutgoing ? "OUT" : "IN"}
                  </span>
                  {/* Transfer type badge */}
                  <span
                    className="shrink-0 rounded-full px-1.5 py-px text-m-caption font-bold uppercase tracking-wide"
                    style={{
                      backgroundColor: t.isInterCompany ? "var(--color-signal-wash)" : "var(--color-concrete)",
                      color: t.isInterCompany ? "var(--color-signal-dark)" : "var(--color-ink-600)",
                    }}
                  >
                    {t.isInterCompany ? "C to C" : "inHouse"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-m-caption font-semibold truncate" style={{ color: "var(--color-ink-500)" }}>
                      {t.fromLocationName}
                    </p>
                    {t.isInterCompany && t.fromCompanyName && (
                      <p className="text-m-caption truncate" style={{ color: "var(--color-steel)" }}>
                        {t.fromCompanyName}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-m-caption font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {t.toLocationName}
                    </p>
                    {t.isInterCompany && t.toCompanyName && (
                      <p className="text-m-caption truncate" style={{ color: "var(--color-steel)" }}>
                        {t.toCompanyName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status + date */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      className="size-3"
                      style={{
                        color:
                          t.status === "RECEIVED" ? "var(--color-go)" :
                          t.status === "CANCELLED" ? "var(--color-stop)" :
                          "var(--color-signal-dark)",
                      }}
                    />
                    <MobileStatusBadge status={t.status} />
                    {isIncoming && t.status === "IN_TRANSIT" ? (
                      <span className="text-m-caption font-bold px-1.5 py-px rounded-full animate-pulse" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)", color: "var(--color-go)" }}>
                        ACTION NEEDED
                      </span>
                    ) : null}
                  </div>
                  <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                    {formatDate(t.transferDate)}
                  </span>
                </div>
              </div>

              {/* Footer: materials + qty */}
              <div
                className="px-2.5 py-1.5 flex items-center justify-between"
                style={{ backgroundColor: "var(--color-paper-2)", borderTop: "1px solid var(--color-line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    {t.lineCount} {t.lineCount === 1 ? "item" : "items"}
                  </p>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>
                    {t.materials.slice(0, 3).join(", ")}
                    {t.materials.length > 3 ? ` +${t.materials.length - 3} more` : ""}
                  </p>
                </div>
                <span className="text-m-label font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(t.totalQty, 2)} units
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <MobileEmptyState
          icon={ArrowRight}
          title={query || filter !== "ALL" ? "No transfers found" : "No stock transfers yet"}
          hint={query || filter !== "ALL" ? "Try a different search or filter" : canCreate ? "Tap the + button below to create your first transfer" : "Stock transfers will appear here"}
        />
      )}
      {loadMoreUrl && filtered.length > 0 ? (
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
