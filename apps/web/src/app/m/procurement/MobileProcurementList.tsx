"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { AlertTriangle, FileText, Check, X, Copy, Share2, Eye, Printer, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {formatNumber, formatDate, formatCurrencyCompact} from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { PageLead, NextActionCard } from "@/components/mobile/v2/guidance";
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

export type DirectPurchaseListItem = {
  id: string;
  billNumber: string;
  supplierName: string;
  locationName: string;
  billDate: string;
  billAmount: number;
  status: "COMPLETED" | "CANCELLED";
  lineCount: number;
};

type ProcurementTab = "purchase-orders" | "cash-purchases";

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
  canApprove?: boolean;
  draftCount?: number;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  directPurchases?: DirectPurchaseListItem[];
  directPurchaseExportRows?: Record<string, unknown>[];
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
  canApprove,
  draftCount = 0,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
  directPurchases = [],
  directPurchaseExportRows,
}: {
  items: ProcurementListItem[];
  canCreate?: boolean;
  canApprove?: boolean;
  draftCount?: number;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  directPurchases?: DirectPurchaseListItem[];
  directPurchaseExportRows?: Record<string, unknown>[];
}) {
  const [tab, setTab] = useState<ProcurementTab>("purchase-orders");
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

  // Filter direct purchases by search query
  const filteredDirectPurchases = useMemo(() => {
    if (!query.trim()) return directPurchases;
    const q = query.toLowerCase();
    return directPurchases.filter(
      (d) =>
        d.billNumber.toLowerCase().includes(q) ||
        d.supplierName.toLowerCase().includes(q),
    );
  }, [directPurchases, query]);

  // ── Cash Purchases tab ──
  if (tab === "cash-purchases") {
    return (
      <div>
        <MobileSearchHeader
          query={query}
          onQueryChange={setQuery}
          placeholder="Search bill no, supplier…"
          action={
            <div className="flex items-center gap-1 shrink-0">
              {directPurchaseExportRows && directPurchaseExportRows.length > 0 ? (
                <MobileExportShareIcons
                  title="Cash Purchases"
                  rows={directPurchaseExportRows}
                  columns={[
                    { key: "billNumber", label: "Bill Number" },
                    { key: "supplierName", label: "Supplier" },
                    { key: "locationName", label: "Location" },
                    { key: "billAmount", label: "Amount", format: "currency" },
                    { key: "billDate", label: "Date", format: "date" },
                    { key: "status", label: "Status" },
                  ] as MobileColumnSpec[]}
                  summary={`${directPurchases.length} cash purchases`}
                />
              ) : null}
            </div>
          }
          showClear={!!query && filteredDirectPurchases.length > 0}
          onClear={() => setQuery("")}
        />

        {/* Tab switcher */}
        <TabSwitcher tab={tab} setTab={setTab} poCount={items.length} dpCount={directPurchases.length} />

        {directPurchases.length === 0 ? (
          <MobileEmptyState
            icon={ShoppingCart}
            title="No cash purchases"
            hint="Direct cash purchases from the local market will appear here"
          />
        ) : filteredDirectPurchases.length === 0 ? (
          <MobileNoResults
            title="No cash purchases found"
            query={query || undefined}
            hint="No cash purchases match your search."
          />
        ) : (
          <div>
            {query && (
              <div className="flex items-center justify-end mb-1.5">
                <span
                  className="text-m-label font-semibold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {filteredDirectPurchases.length} Cash Purchase
                  {filteredDirectPurchases.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <MobileCardGrid cols={2}>
              {filteredDirectPurchases.map((dp) => (
                <DirectPurchaseCard key={dp.id} dp={dp} />
              ))}
            </MobileCardGrid>
          </div>
        )}
      </div>
    );
  }

  // ── Purchase Orders tab (default) ──
  if (items.length === 0 && directPurchases.length === 0) {
    return (
      <div>
        <TabSwitcher tab={tab} setTab={setTab} poCount={items.length} dpCount={directPurchases.length} />
        <PageLead flow="procurement" />
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

      <TabSwitcher tab={tab} setTab={setTab} poCount={items.length} dpCount={directPurchases.length} />

      {/* ── Orientation: what is this page + what to do next ── */}
      <PageLead flow="procurement" />
      <NextActionCard
        flow="procurement"
        count={draftCount}
        can={(perm) => perm === "PO_APPROVE" ? !!canApprove : false}
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
                className="text-m-label font-semibold"
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

/* ── Tab Switcher ── */
function TabSwitcher({
  tab,
  setTab,
  poCount,
  dpCount,
}: {
  tab: ProcurementTab;
  setTab: (t: ProcurementTab) => void;
  poCount: number;
  dpCount: number;
}) {
  return (
    <div
      className="flex items-center gap-1 p-0.5 rounded-[0.5rem] mb-2"
      style={{ backgroundColor: "var(--color-concrete)" }}
    >
      <button
        onClick={() => { haptic(5); setTab("purchase-orders"); }}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[0.375rem] text-m-label font-bold transition-colors text-m-body press"
        style={{
          backgroundColor: tab === "purchase-orders" ? "var(--color-paper)" : "transparent",
          color: tab === "purchase-orders" ? "var(--color-ink-950)" : "var(--color-ink-500)",
          boxShadow: tab === "purchase-orders" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        }}
      >
        <FileText className="size-3" />
        POs
        <span className="text-m-caption tabular-nums opacity-70">{poCount}</span>
      </button>
      <button
        onClick={() => { haptic(5); setTab("cash-purchases"); }}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[0.375rem] text-m-label font-bold transition-colors text-m-body press"
        style={{
          backgroundColor: tab === "cash-purchases" ? "var(--color-paper)" : "transparent",
          color: tab === "cash-purchases" ? "var(--color-ink-950)" : "var(--color-ink-500)",
          boxShadow: tab === "cash-purchases" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        }}
      >
        <ShoppingCart className="size-3" />
        Cash
        <span className="text-m-caption tabular-nums opacity-70">{dpCount}</span>
      </button>
    </div>
  );
}

/* ── Direct Purchase Card ── */
function DirectPurchaseCard({ dp }: { dp: DirectPurchaseListItem }) {
  const isCancelled = dp.status === "CANCELLED";
  const accentColor = isCancelled ? "var(--color-stop)" : "var(--color-go)";

  return (
    <a
      href={`/print/direct-purchase/${dp.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Bill number + status */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-body font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {dp.billNumber}
          </span>
          <span
            className="text-m-caption font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {isCancelled ? "Cancelled" : "Paid"}
          </span>
        </div>

        {/* Row 2: Supplier name */}
        <p
          className="text-m-body font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {dp.supplierName}
        </p>

        {/* Row 3: Amount + date */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-body font-bold tabular-nums"
            style={{ color: "var(--color-ink-950)" }}
          >
            {formatCurrencyCompact(dp.billAmount)}
          </span>
          <span
            className="text-m-caption tabular-nums"
            style={{ color: "var(--color-ink-500)" }}
          >
            {formatDate(dp.billDate)}
          </span>
        </div>

        {/* Row 4: Location + print icon */}
        <div className="mt-auto pt-1 h-[1.75rem] flex items-center justify-between">
          <span
            className="text-m-caption truncate"
            style={{ color: "var(--color-ink-500)" }}
          >
            {dp.locationName} · {dp.lineCount} item{dp.lineCount !== 1 ? "s" : ""}
          </span>
          <Printer className="size-3 shrink-0" style={{ color: "var(--color-brand)" }} />
        </div>
      </div>
    </a>
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
    if (!window.confirm("Cancel this purchase order?")) return;
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
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
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
            className="text-m-body font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {po.poNumber}
          </span>
          <span
            className="text-m-caption font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {isOverdue ? "Overdue" : style.label}
          </span>
        </div>

        {/* Row 2: Supplier name */}
        <p
          className="text-m-body font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {po.supplierName}
        </p>

        {/* Row 3: Total + delivery */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-body font-bold tabular-nums"
            style={{ color: "var(--color-ink-950)" }}
          >
            {formatCurrencyCompact(po.total)}
          </span>
          {deliveryText ? (
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: deliveryColor }}
            >
              {deliveryText}
            </span>
          ) : po.status === "DRAFT" ? (
            <span
              className="text-m-caption"
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
                  className="text-m-caption"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Received
                </span>
                <span
                  className="text-m-caption font-bold tabular-nums"
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
                className="text-m-caption font-semibold"
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
