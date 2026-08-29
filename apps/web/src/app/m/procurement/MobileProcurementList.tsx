"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { AlertTriangle, FileText, Check, X, Copy, Share2, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { SwipeableListItem } from "@/components/mobile/swipeable-item";
import { MobileContextMenu, type ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import { useLongPress } from "@/lib/use-long-press";
import { useUrlFilter, useUrlQuery } from "@/lib/use-url-filter";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

type PoStatus =
  | "ALL"
  | "DRAFT"
  | "APPROVED"
  | "ORDERED"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED";

export type ProcurementListItem = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  expectedDate: string | null;
  createdAt: string;
  total: number;
  qtyOrdered: number;
  qtyReceived: number;
  isOverdue: boolean;
};

const FILTER_CHIPS: { label: string; value: PoStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Approved", value: "APPROVED" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/* ── Status → accent color + label ── */
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  DRAFT: { color: "var(--color-ink-500)", label: "Draft" },
  APPROVED: { color: "var(--color-signal)", label: "Approved" },
  ORDERED: { color: "var(--color-steel)", label: "Ordered" },
  PARTIAL: { color: "var(--color-signal)", label: "Partial" },
  RECEIVED: { color: "var(--color-go)", label: "Received" },
  CANCELLED: { color: "var(--color-stop)", label: "Cancelled" },
};

export function MobileProcurementList(props: {
  items: ProcurementListItem[];
  canCreate?: boolean;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  // Wrap in Suspense — useSearchParams requires it
  return (
    <Suspense fallback={null}>
      <MobileProcurementListInner {...props} />
    </Suspense>
  );
}

function MobileProcurementListInner({
  items: initialItems,
  canCreate,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ProcurementListItem[];
  canCreate?: boolean;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  // URL-persistent filters — survive navigation away and back
  const [query, setQuery] = useUrlQuery("q", "");
  const [statusFilter, setStatusFilter] = useUrlFilter<PoStatus>("status", "ALL");
  const router = useRouter();

  // Paginated list — appends items when "Load More" is clicked
  const { items, loading, hasMore, loadMore } = usePaginatedList<ProcurementListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.poNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) {
    return (
      <div>
        <MobileEmptyState
          icon={FileText}
          title="No purchase orders"
          hint={
            canCreate
              ? "Tap the + button below to create your first Purchase Order"
              : "Purchase orders will appear here"
          }
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search Purchase Order no, supplier…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={(v) => setStatusFilter(v as PoStatus)}
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
        showClear={(statusFilter !== "ALL" || !!query) && filtered.length > 0}
        onClear={() => {
          setQuery("");
          setStatusFilter("ALL");
        }}
      />

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No Purchase Orders found"
          query={query || undefined}
          hint="No Purchase Orders match the selected filter."
        />
      ) : (
        <div>
          {(query || statusFilter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-[0.625rem] font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} Purchase Order
                {filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid cols={2}>
            {filtered.map((po) => (
              <PoCard key={po.id} po={po} onAction={() => router.refresh()} />
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

/* ═══════════════════════════════════════════════════════════════════════════
   PO CARD — compact 2-col grid card with status accent + context info.
   ═══════════════════════════════════════════════════════════════════════════ */
function PoCard({
  po,
  onAction,
}: {
  po: ProcurementListItem;
  onAction?: () => void;
}) {
  const router = useRouter();
  const style = STATUS_STYLE[po.status] ?? STATUS_STYLE.DRAFT!;
  const isOverdue = po.isOverdue;
  const accentColor = isOverdue ? "var(--color-stop)" : style.color;

  // Swipe actions for DRAFT POs (approve / cancel)
  const canSwipe = po.status === "DRAFT";

  const handleApprove = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      toast.success(`PO ${po.poNumber} approved`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [po.id, po.poNumber, onAction]);

  const handleCancel = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success(`PO ${po.poNumber} cancelled`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [po.id, po.poNumber, onAction]);

  const swipeActions = canSwipe
    ? [
        { label: "Approve", color: "var(--color-go)", onPress: handleApprove },
        { label: "Cancel", color: "var(--color-stop)", onPress: handleCancel },
      ]
    : [];

  // ── Long-press context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const { bind: longPressBind } = useLongPress(() => setMenuOpen(true));

  const contextActions: ContextAction[] = [
    { label: "View Details", icon: Eye, onPress: () => router.push(`/m/procurement/${po.id}`) },
    ...(po.status === "DRAFT"
      ? [
          { label: "Approve", icon: Check, color: "var(--color-go)", onPress: handleApprove },
          { label: "Cancel", icon: X, color: "var(--color-stop)", destructive: true, onPress: handleCancel },
        ]
      : []),
    {
      label: "Copy PO Number",
      icon: Copy,
      onPress: () => {
        navigator.clipboard?.writeText(po.poNumber).catch(() => {});
        toast.success(`Copied ${po.poNumber}`);
      },
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/procurement/${po.id}`;
        if (navigator.share) {
          navigator.share({ title: po.poNumber, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  // Receiving progress for ordered/partial
  const showProgress = po.status === "ORDERED" || po.status === "PARTIAL";
  const recvPct =
    po.qtyOrdered > 0 ? (po.qtyReceived / po.qtyOrdered) * 100 : 0;

  // Days until/overdue delivery
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let deliveryText = "";
  let deliveryColor = "var(--color-ink-500)";
  if (po.expectedDate) {
    const expected = new Date(po.expectedDate);
    expected.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (expected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (isOverdue) {
      deliveryText = `${Math.abs(diffDays)}d late`;
      deliveryColor = "var(--color-stop)";
    } else if (diffDays === 0) {
      deliveryText = "today";
      deliveryColor = "var(--color-signal)";
    } else if (diffDays === 1) {
      deliveryText = "tomorrow";
      deliveryColor = "var(--color-signal)";
    } else if (diffDays > 0) {
      deliveryText = `${diffDays}d`;
    } else {
      deliveryText = formatDate(po.expectedDate);
    }
  }

  const card = (
    <Link
      href={`/m/procurement/${po.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: PO number + status label */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[0.6875rem] font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {po.poNumber}
          </span>
          <span
            className="text-[0.5625rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {isOverdue ? "Overdue" : style.label}
          </span>
        </div>

        {/* Row 2: Supplier name */}
        <p
          className="text-[0.6875rem] font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {po.supplierName}
        </p>

        {/* Row 3: Total + delivery */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[0.6875rem] font-bold tabular-nums"
            style={{ color: "var(--color-ink-950)" }}
          >
            {formatCurrency(po.total)}
          </span>
          {deliveryText ? (
            <span
              className="text-[0.5625rem] font-bold tabular-nums"
              style={{ color: deliveryColor }}
            >
              {deliveryText}
            </span>
          ) : po.status === "DRAFT" ? (
            <span
              className="text-[0.5625rem]"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatDate(po.createdAt)}
            </span>
          ) : null}
        </div>

        {/* Row 4: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1.75rem] flex items-center">
          {showProgress ? (
            <div className="w-full">
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className="text-[0.5rem]"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Received
                </span>
                <span
                  className="text-[0.5rem] font-bold tabular-nums"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  {formatNumber(po.qtyReceived, 0)}/
                  {formatNumber(po.qtyOrdered, 0)}
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(recvPct, 100)}%`,
                    backgroundColor:
                      po.status === "PARTIAL"
                        ? "var(--color-signal)"
                        : "var(--color-steel)",
                  }}
                />
              </div>
            </div>
          ) : isOverdue ? (
            <div className="flex items-center gap-1">
              <AlertTriangle
                className="size-3"
                style={{ color: "var(--color-stop)" }}
              />
              <span
                className="text-[0.5rem] font-semibold"
                style={{ color: "var(--color-stop)" }}
              >
                Awaiting receipt
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );

  // Wrap card with long-press handlers
  const cardWithLongPress = (
    <div {...longPressBind}>
      {card}
    </div>
  );

  if (swipeActions.length > 0) {
    return (
      <>
        <SwipeableListItem actions={swipeActions} className="rounded-[0.625rem]">
          {cardWithLongPress}
        </SwipeableListItem>
        <MobileContextMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={po.poNumber}
          subtitle={po.supplierName}
          actions={contextActions}
        />
      </>
    );
  }
  return (
    <>
      {cardWithLongPress}
      <MobileContextMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={po.poNumber}
        subtitle={po.supplierName}
        actions={contextActions}
      />
    </>
  );
}
