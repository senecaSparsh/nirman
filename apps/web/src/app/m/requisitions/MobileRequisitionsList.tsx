"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { CheckCircle2, ShoppingCart, Send, Check, X, Eye, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { PageLead, NextActionCard } from "@/components/mobile/v2/guidance";
import { SwipeableListItem } from "@/components/mobile/swipeable-item";
import { MobileContextMenu, type ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

type ReqStatus =
  | "ALL"
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED";

export type RequisitionListItem = {
  id: string;
  reqNumber: string;
  status: string;
  projectName: string | null;
  createdAt: string;
  neededByDate: string | null;
  lineCount: number;
  quoteCount: number;
  minQuotesRequired: number;
  quotesWaived: boolean;
  convertedToPo: boolean;
  rejectReason: string | null;
  requestedByName: string | null;
};

const FILTER_CHIPS: { label: string; value: ReqStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Converted", value: "CONVERTED" },
];

/* ── Status → accent color + label ── */
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  DRAFT: { color: "var(--color-ink-500)", label: "Draft" },
  SUBMITTED: { color: "var(--color-signal)", label: "Submitted" },
  APPROVED: { color: "var(--color-steel)", label: "Approved" },
  REJECTED: { color: "var(--color-stop)", label: "Rejected" },
  CONVERTED: { color: "var(--color-go)", label: "Converted" },
};

export function MobileRequisitionsList({
  items: initialItems,
  canCreate,
  canApprove,
  submittedCount = 0,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: RequisitionListItem[];
  canCreate?: boolean;
  canApprove?: boolean;
  submittedCount?: number;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReqStatus>("ALL");
  const router = useRouter();

  const { items, loading, hasMore, loadMore } = usePaginatedList<RequisitionListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.reqNumber.toLowerCase().includes(q) ||
          r.projectName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) {
    return (
      <div>
        <PageLead flow="requisition" />
        <MobileEmptyState
          icon={ShoppingCart}
          title="No material indents"
          hint={
            canCreate
              ? "Tap the + button below to create your first indent"
              : "Material indents will appear here"
          }
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Summary strip (same position across all procurement tabs) ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Total", value: String(items.length) },
          { label: "Draft", value: String(items.filter((r) => r.status === "DRAFT").length) },
          { label: "Submitted", value: String(items.filter((r) => r.status === "SUBMITTED").length) },
          { label: "Approved", value: String(items.filter((r) => r.status === "APPROVED").length) },
        ]}
      />

      {/* ── Sticky search header (same position across all procurement tabs) ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search req no, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={(v) => setStatusFilter(v as ReqStatus)}
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

      {/* ── Orientation: what is this page + what to do next (below search
          so search + summary strip stay in the same position across tabs) ── */}
      <PageLead flow="requisition" />
      <NextActionCard
        flow="requisition"
        count={submittedCount}
        can={(perm) => perm === "REQUISITION_APPROVE" ? !!canApprove : false}
      />

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No indents found"
          query={query || undefined}
          hint="No indents match the selected filter."
        />
      ) : (
        <div>
          {(query || statusFilter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} indent{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid cols={2}>
            {filtered.map((r) => (
              <ReqCard key={r.id} req={r} onAction={() => router.refresh()} />
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
   REQ CARD — distinct from PO cards. Left accent bar, requester-focused,
   needed-by badge, approval workflow context.
   ═══════════════════════════════════════════════════════════════════════════ */
function ReqCard({ req, onAction }: { req: RequisitionListItem; onAction?: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { bind: longPressBind } = useLongPress(() => setMenuOpen(true));
  const style = STATUS_STYLE[req.status] ?? STATUS_STYLE.DRAFT!;
  const accentColor = style.color;

  // ── Actions based on status ──
  const handleApprove = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      toast.success(`Indent ${req.reqNumber} approved`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [req.id, req.reqNumber, onAction]);

  const handleReject = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectReason: "Rejected from mobile" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success(`Indent ${req.reqNumber} rejected`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [req.id, req.reqNumber, onAction]);

  const handleSubmit = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      toast.success(`Indent ${req.reqNumber} submitted for approval`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [req.id, req.reqNumber, onAction]);

  // Swipe actions based on status
  const swipeActions =
    req.status === "DRAFT"
      ? [{ label: "Submit", color: "var(--color-steel)", onPress: handleSubmit }]
      : req.status === "SUBMITTED"
        ? [
            { label: "Approve", color: "var(--color-go)", onPress: handleApprove },
            { label: "Reject", color: "var(--color-stop)", onPress: handleReject },
          ]
        : [];

  // Context menu actions
  const contextActions: ContextAction[] = [
    { label: "View Details", icon: Eye, onPress: () => router.push(`/m/requisitions/${req.id}`) },
    ...(req.status === "DRAFT"
      ? [{ label: "Submit", icon: Send, color: "var(--color-steel)", onPress: handleSubmit }]
      : []),
    ...(req.status === "SUBMITTED"
      ? [
          { label: "Approve", icon: Check, color: "var(--color-go)", onPress: handleApprove },
          { label: "Reject", icon: X, color: "var(--color-stop)", destructive: true, onPress: handleReject },
        ]
      : []),
    {
      label: "Copy Number",
      icon: Copy,
      onPress: () => {
        navigator.clipboard?.writeText(req.reqNumber).catch(() => {});
        toast.success(`Copied ${req.reqNumber}`);
      },
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/requisitions/${req.id}`;
        if (navigator.share) {
          navigator.share({ title: req.reqNumber, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  // Needed-by date context
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let neededText = "";
  let neededColor = "var(--color-ink-500)";
  let neededUrgent = false;
  if (req.neededByDate) {
    const needed = new Date(req.neededByDate);
    needed.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (needed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      // Human-readable overdue: < 30d → "Nd overdue", 30-365 → "Nmo overdue", > 365 → "Ny Nmo overdue"
      if (absDays < 30) {
        neededText = `${absDays}d overdue`;
      } else if (absDays < 365) {
        const months = Math.floor(absDays / 30);
        neededText = `${months}mo overdue`;
      } else {
        const years = Math.floor(absDays / 365);
        const months = Math.floor((absDays % 365) / 30);
        neededText = months > 0 ? `${years}y ${months}mo overdue` : `${years}y overdue`;
      }
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays === 0) {
      neededText = "today";
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays <= 3) {
      neededText = `${diffDays}d left`;
      neededColor = "var(--color-signal)";
      neededUrgent = true;
    } else {
      neededText = formatDate(req.neededByDate);
    }
  }

  // Quote gate status for approved reqs
  const quotesMet = req.quoteCount >= req.minQuotesRequired || req.quotesWaived;

  const card = (
    <Link
      href={`/m/requisitions/${req.id}`}
      className="flex rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Left accent bar — distinct from PO's top strip */}
      <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1 min-w-0">
        {/* Row 1: Req number + needed-by badge */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-caption font-mono font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {req.reqNumber}
          </span>
          {neededText ? (
            <span
              className="text-m-caption font-bold tabular-nums px-2 py-0.5 rounded-[0.375rem] shrink-0"
              style={{
                backgroundColor: neededUrgent
                  ? neededColor
                  : "var(--color-concrete)",
                color: neededUrgent ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {neededText}
            </span>
          ) : null}
        </div>

        {/* Row 2: Project name */}
        <p
          className="text-m-label font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {req.projectName ?? "No project"}
        </p>

        {/* Row 3: Requester + line count */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-m-caption truncate"
            style={{ color: "var(--color-ink-500)" }}
          >
            {req.requestedByName ?? "—"}
          </span>
          <span
            className="text-m-caption font-semibold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            {req.lineCount} item{req.lineCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Row 4: Bottom area — fixed height, status-specific action context */}
        <div className="mt-auto pt-1 h-[1.5rem] flex items-center">
          {req.status === "SUBMITTED" ? (
            <div className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-signal)" }}
              />
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-signal)" }}
              >
                Needs approval
              </span>
            </div>
          ) : req.status === "APPROVED" ? (
            quotesMet ? (
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--color-go)" }}
                />
                <span
                  className="text-m-caption font-semibold"
                  style={{ color: "var(--color-go)" }}
                >
                  Ready for PO
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--color-signal)" }}
                />
                <span
                  className="text-m-caption font-semibold"
                  style={{ color: "var(--color-signal)" }}
                >
                  {req.quoteCount}/{req.minQuotesRequired} quotes
                </span>
              </div>
            )
          ) : req.status === "CONVERTED" ? (
            <div className="flex items-center gap-1">
              <CheckCircle2
                className="size-2.5"
                style={{ color: "var(--color-go)" }}
              />
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-go)" }}
              >
                Purchase Order created
              </span>
            </div>
          ) : req.status === "REJECTED" ? (
            <span
              className="text-m-caption font-semibold truncate"
              style={{ color: "var(--color-stop)" }}
            >
              {req.rejectReason ?? "Rejected"}
            </span>
          ) : req.status === "DRAFT" ? (
            <span
              className="text-m-caption"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatDate(req.createdAt)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );

  const cardWithLongPress = <div {...longPressBind}>{card}</div>;

  if (swipeActions.length > 0) {
    return (
      <>
        <SwipeableListItem actions={swipeActions} className="rounded-[0.625rem]">
          {cardWithLongPress}
        </SwipeableListItem>
        <MobileContextMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={req.reqNumber}
          subtitle={req.projectName ?? undefined}
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
        title={req.reqNumber}
        subtitle={req.projectName ?? undefined}
        actions={contextActions}
      />
    </>
  );
}
