"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useUrlFilter } from "@/lib/use-url-filter";
import { PERM } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { CheckCircle2, ShoppingCart, Send, Check, X, Eye, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useHydratedDate } from "@/lib/use-hydrated-date";
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
import { usePrompt } from "@/lib/use-prompt";

type ReqStatus =
  | "ALL"
  /** Pseudo-filters behind the tappable stats: approved indents split by the quote gate. */
  | "NEED_QUOTES"
  | "READY"
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
  /** "Cement PPC · 50 BAG +2 more" — see lib/line-summary. */
  itemSummary?: string | null;
  quoteCount: number;
  minQuotesRequired: number;
  quotesWaived: boolean;
  convertedToPo: boolean;
  rejectReason: string | null;
  requestedByName: string | null;
  requestedById: string | null;
};

const FILTER_CHIPS: { label: string; value: ReqStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Need quotes", value: "NEED_QUOTES" },
  { label: "Ready for PO", value: "READY" },
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

function quotesMetFor(r: RequisitionListItem): boolean {
  return r.quoteCount >= r.minQuotesRequired || r.quotesWaived;
}

export function MobileRequisitionsList(props: {
  items: RequisitionListItem[];
  canCreate?: boolean;
  canApprove?: boolean;
  /** Tier-1 viewers may approve their own items. */
  canSelfApprove?: boolean;
  currentUserId?: string | null;
  submittedCount?: number;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  // Suspense — useUrlFilter/useSearchParams requires it
  return (
    <Suspense fallback={null}>
      <MobileRequisitionsListInner {...props} />
    </Suspense>
  );
}

function MobileRequisitionsListInner({
  items: initialItems,
  canCreate,
  canApprove,
  canSelfApprove,
  currentUserId,
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
  /** Tier-1 viewers may approve their own items. */
  canSelfApprove?: boolean;
  currentUserId?: string | null;
  submittedCount?: number;
  loadMoreUrl?: string;
  nextCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useUrlFilter<ReqStatus>("status", "ALL");
  const router = useRouter();

  const { items, loading, hasMore, loadMore } = usePaginatedList<RequisitionListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter === "NEED_QUOTES") {
      result = result.filter((r) => r.status === "APPROVED" && !quotesMetFor(r));
    } else if (statusFilter === "READY") {
      result = result.filter((r) => r.status === "APPROVED" && quotesMetFor(r));
    } else if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.reqNumber.toLowerCase().includes(q) ||
          r.projectName?.toLowerCase().includes(q) ||
          r.itemSummary?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const toggleFilter = (v: ReqStatus) => {
    haptic(5);
    setStatusFilter(statusFilter === v ? "ALL" : v);
  };

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
      {/* ── Summary strip — where indents are stuck, each a one-tap filter ── */}
      <MobileSummaryStrip
        stats={[
          { label: "To approve", value: String(items.filter((r) => r.status === "SUBMITTED").length), tone: "signal", onClick: () => toggleFilter("SUBMITTED"), active: statusFilter === "SUBMITTED" },
          { label: "Need quotes", value: String(items.filter((r) => r.status === "APPROVED" && !quotesMetFor(r)).length), tone: "signal", onClick: () => toggleFilter("NEED_QUOTES"), active: statusFilter === "NEED_QUOTES" },
          { label: "Ready for PO", value: String(items.filter((r) => r.status === "APPROVED" && quotesMetFor(r)).length), tone: "go", onClick: () => toggleFilter("READY"), active: statusFilter === "READY" },
          { label: "Converted", value: String(items.filter((r) => r.status === "CONVERTED").length), onClick: () => toggleFilter("CONVERTED"), active: statusFilter === "CONVERTED" },
        ]}
      />

      {/* ── Sticky search header (same position across all procurement tabs) ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search material, project, indent no…"
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
        can={(perm) => perm === PERM.REQUISITION_APPROVE ? !!canApprove : false}
      />

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No material requests found"
          query={query || undefined}
          hint="Material requests (indents) ask the store to issue materials. Tap + to create one."
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
              <ReqCard key={r.id} req={r} canApprove={canApprove} currentUserId={currentUserId} canSelfApprove={canSelfApprove} onAction={() => router.refresh()} />
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
function ReqCard({ req, canApprove, currentUserId, canSelfApprove, onAction }: { req: RequisitionListItem; canApprove?: boolean; currentUserId?: string | null; canSelfApprove?: boolean; onAction?: () => void }) {
  const router = useRouter();
  const now = useHydratedDate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { bind: longPressBind } = useLongPress(() => setMenuOpen(true));
  const [prompt, promptDialog] = usePrompt();
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
    const reason = await prompt({
      title: "Reject indent",
      description: `Reject ${req.reqNumber}? The requester will see this reason.`,
      label: "Reason",
      placeholder: "Why is this indent being rejected?",
      multiline: true,
      confirmLabel: "Reject",
    });
    if (reason === null || !reason.trim()) return;
    haptic(10);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectReason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success(`Indent ${req.reqNumber} rejected`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [req.id, req.reqNumber, onAction, prompt]);

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

  // ── Permission + creator gate: only show approve/reject to users who
  //    have REQUISITION_APPROVE AND did not create this indent themselves.
  // Tier-1 approvers (OWNER/ADMIN) may approve their own indent.
  const canActOn = canApprove && (req.requestedById !== currentUserId || canSelfApprove);

  // Swipe actions based on status
  const swipeActions =
    req.status === "DRAFT" || req.status === "REJECTED"
      ? [{ label: "Resubmit", color: "var(--color-steel)", onPress: handleSubmit }]
      : req.status === "SUBMITTED" && canActOn
        ? [
            { label: "Approve", color: "var(--color-go)", onPress: handleApprove },
            { label: "Reject", color: "var(--color-stop)", onPress: handleReject },
          ]
        : [];

  // Context menu actions
  const contextActions: ContextAction[] = [
    { label: "View Details", icon: Eye, onPress: () => router.push(`/m/requisitions/${req.id}`) },
    ...(req.status === "DRAFT" || req.status === "REJECTED"
      ? [{ label: "Resubmit", icon: Send, color: "var(--color-steel)", onPress: handleSubmit }]
      : []),
    ...(req.status === "SUBMITTED" && canActOn
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
  const today = now ? new Date(now) : null;
  if (today) today.setHours(0, 0, 0, 0);
  let neededText = "";
  let neededColor = "var(--color-ink-500)";
  let neededUrgent = false;
  if (req.neededByDate && today) {
    const needed = new Date(req.neededByDate);
    needed.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (needed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      // Human-readable overdue — spelled out for non-technical users
      if (absDays < 30) {
        neededText = `${absDays} day${absDays !== 1 ? "s" : ""} overdue`;
      } else if (absDays < 365) {
        const months = Math.floor(absDays / 30);
        neededText = `${months} month${months !== 1 ? "s" : ""} overdue`;
      } else {
        const years = Math.floor(absDays / 365);
        const months = Math.floor((absDays % 365) / 30);
        neededText = months > 0
          ? `${years} yr ${months} mo overdue`
          : `${years} year${years !== 1 ? "s" : ""} overdue`;
      }
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays === 0) {
      neededText = "today";
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays <= 3) {
      neededText = `${diffDays} day${diffDays !== 1 ? "s" : ""} left`;
      neededColor = "var(--color-signal)";
      neededUrgent = true;
    } else {
      neededText = formatDate(req.neededByDate);
    }
  }

  // Quote gate status for approved reqs
  const quotesMet = quotesMetFor(req);

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
        {/* Row 1: What's being asked for — the thing people scan for, so it
            gets the full card width. */}
        <span
          className="text-m-strong leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {req.itemSummary ?? `${req.lineCount} item${req.lineCount !== 1 ? "s" : ""}`}
        </span>

        {/* Row 2: Where + who */}
        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
          <span className="font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {req.projectName ?? "No project"}
          </span>
          {req.requestedByName ? ` · ${req.requestedByName}` : ""}
        </p>

        {/* Row 3: Reference number (for matching paperwork) + needed-by */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-m-micro font-mono truncate" style={{ color: "var(--color-ink-400)" }}>
            {req.reqNumber}
          </span>
          {neededText ? (
            <span
              className="text-m-micro font-bold tabular-nums px-1.5 py-px rounded-[0.25rem] shrink-0"
              style={{
                backgroundColor: neededUrgent ? neededColor : "var(--color-concrete)",
                color: neededUrgent ? "var(--color-paper)" : "var(--color-ink-500)",
              }}
            >
              {neededText}
            </span>
          ) : null}
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
        {promptDialog}
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
      {promptDialog}
    </>
  );
}
