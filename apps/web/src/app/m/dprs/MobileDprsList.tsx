"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { useHydratedDate } from "@/lib/use-hydrated-date";
import { PageLead, NextActionCard } from "@/components/mobile/v2/guidance";
import { SwipeableListItem } from "@/components/mobile/swipeable-item";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

type DprApprovalFilter =
  | "ALL"
  | "SUBMITTED"
  | "SUB_ADMIN_APPROVED"
  | "APPROVED"
  | "REJECTED";

export type DprListItem = {
  id: string;
  date: string;
  projectName: string;
  projectId: string;
  submittedByName: string | null;
  submittedById: string | null;
  approvalStatus: string;
  progressPct: number;
  workType: string | null;
};

const FILTER_CHIPS: { label: string; value: DprApprovalFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Sub-Admin", value: "SUB_ADMIN_APPROVED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

/* ── Approval status → color + label + step index ── */
const STATUS_INFO: Record<
  string,
  { color: string; label: string; step: number }
> = {
  SUBMITTED: { color: "var(--color-signal)", label: "Submitted", step: 1 },
  SUB_ADMIN_APPROVED: {
    color: "var(--color-steel)",
    label: "Sub-Admin OK",
    step: 2,
  },
  APPROVED: { color: "var(--color-go)", label: "Approved", step: 3 },
  REJECTED: { color: "var(--color-stop)", label: "Rejected", step: 0 },
};

export function MobileDprsList({
  items: initialItems,
  canSubmit,
  canApproveSubAdmin,
  canApproveAdmin,
  currentUserId,
  submittedCount = 0,
  loadMoreUrl,
  nextCursor: initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: DprListItem[];
  canSubmit?: boolean;
  canApproveSubAdmin?: boolean;
  canApproveAdmin?: boolean;
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
  const [statusFilter, setStatusFilter] = useState<DprApprovalFilter>("ALL");
  const router = useRouter();

  const { items, loading, hasMore, loadMore } = usePaginatedList<DprListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const hydratedNow = useHydratedDate();

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((d) => d.approvalStatus === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (d) =>
          d.projectName.toLowerCase().includes(q) ||
          (d.submittedByName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  // Group by date label
  const grouped = useMemo(() => {
    // Use hydrated date to avoid SSR/client timezone mismatch.
    // Before mount, no grouping by "Today"/"Yesterday" — everything goes to "Earlier".
    const today = hydratedNow ? new Date(hydratedNow.getTime()) : null;
    if (today) today.setHours(0, 0, 0, 0);
    const yesterday = today ? new Date(today) : null;
    if (yesterday) yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: DprListItem[] }[] = [];
    const map = new Map<string, DprListItem[]>();

    for (const d of filtered) {
      const dDate = new Date(d.date);
      const label = today && sameDay(dDate, today)
        ? "Today"
        : yesterday && sameDay(dDate, yesterday)
          ? "Yesterday"
          : formatDate(d.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(d);
    }
    for (const [label, items] of map) {
      groups.push({ label, items });
    }
    return groups;
  }, [filtered, hydratedNow]);

  if (items.length === 0) {
    return (
      <div>
        <PageLead flow="dpr" />
        <MobileEmptyState
          icon={ClipboardList}
          title="No Daily Progress Reports yet"
          hint={
            canSubmit
              ? "Tap the + button below to submit your first Daily Progress Report"
              : "Daily progress reports will appear here"
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
        placeholder="Search project, submitter…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={(v) => setStatusFilter(v as DprApprovalFilter)}
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
        showClear={statusFilter !== "ALL" || query !== ""}
        onClear={() => {
          setQuery("");
          setStatusFilter("ALL");
        }}
      />

      {/* ── Orientation: what is this page + what to do next ── */}
      <PageLead flow="dpr" />
      <NextActionCard
        flow="dpr"
        count={submittedCount}
        can={(perm) => perm === "DPR_APPROVE_SUB_ADMIN" ? !!canApproveSubAdmin : false}
      />

      {/* ── Date-grouped sections ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No progress reports found"
          query={query || undefined}
          hint="Daily Progress Reports track work done on site. Tap + to create one."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date section header */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-m-body font-bold"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {group.label}
                </span>
                <span
                  className="text-m-caption font-semibold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {group.items.length} report
                  {group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* DPR strips */}
              <div className="flex flex-col gap-2">
                {group.items.map((d) => (
                  <DprStrip
                    key={d.id}
                    dpr={d}
                    canApproveSubAdmin={canApproveSubAdmin}
                    canApproveAdmin={canApproveAdmin}
                    currentUserId={currentUserId}
                    onAction={() => router.refresh()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
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

/* ═══════════════════════════════════════════════════════════════════════════
   DPR STRIP — full-width horizontal card with progress ring + approval dots.
   ═══════════════════════════════════════════════════════════════════════════ */
function DprStrip({
  dpr,
  canApproveSubAdmin,
  canApproveAdmin,
  currentUserId,
  onAction,
}: {
  dpr: DprListItem;
  canApproveSubAdmin?: boolean;
  canApproveAdmin?: boolean;
  currentUserId?: string | null;
  onAction?: () => void;
}) {
  const info = STATUS_INFO[dpr.approvalStatus] ?? STATUS_INFO.SUBMITTED!;
  const isRejected = dpr.approvalStatus === "REJECTED";
  const pct = Math.min(dpr.progressPct, 100);

  // ── Permission + creator gate: only show approve/reject to users who have
  //    the right approval permission AND did not submit this DPR themselves.
  const isOwnDpr = dpr.submittedById !== currentUserId;
  const canSubAdminAct = canApproveSubAdmin && isOwnDpr;
  const canAdminAct = canApproveAdmin && isOwnDpr;

  // Swipe actions for submitted / sub-admin approved DPRs
  const canSwipeApprove =
    (dpr.approvalStatus === "SUBMITTED" && canSubAdminAct) ||
    (dpr.approvalStatus === "SUB_ADMIN_APPROVED" && canAdminAct);
  const approveAction =
    dpr.approvalStatus === "SUBMITTED" ? "subAdminApprove" : "adminApprove";
  const approveLabel =
    dpr.approvalStatus === "SUBMITTED" ? "Sub-Approve" : "Approve";

  const handleApprove = useCallback(async () => {
    haptic(10);
    try {
      const res = await fetch(`/api/dprs/${dpr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: approveAction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      toast.success("DPR approved");
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [dpr.id, approveAction, onAction]);

  const handleReject = useCallback(async () => {
    haptic(10);
    const reason = window.prompt("Reason for rejection (required):");
    if (!reason?.trim()) {
      if (reason !== null) toast.error("Rejection reason is required");
      return;
    }
    try {
      const res = await fetch(`/api/dprs/${dpr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success("DPR rejected");
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }, [dpr.id, onAction]);

  const swipeActions = canSwipeApprove
    ? [
        {
          label: approveLabel,
          color: "var(--color-go)",
          onPress: handleApprove,
        },
        { label: "Reject", color: "var(--color-stop)", onPress: handleReject },
      ]
    : [];

  const card = (
    <Link
      href={`/m/dprs/${dpr.id}`}
      className="flex items-stretch rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Left edge — colored by status */}
      <div className="w-1 shrink-0" style={{ backgroundColor: info.color }} />

      {/* Main content */}
      <div className="flex-1 min-w-0 p-2.5">
        {/* Row 1: Project + status label */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p
            className="text-m-section font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {dpr.projectName}
          </p>
          <span
            className="text-m-caption font-bold uppercase shrink-0"
            style={{ color: info.color }}
          >
            {info.label}
          </span>
        </div>

        {/* Row 2: Submitter + work type */}
        <p
          className="text-m-caption truncate mb-1.5"
          style={{ color: "var(--color-ink-500)" }}
        >
          {dpr.submittedByName ?? "—"}
          {dpr.workType ? ` · ${dpr.workType}` : ""}
        </p>

        {/* Row 3: Progress bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="h-1.5 rounded-full overflow-hidden flex-1"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: isRejected ? "var(--color-stop)" : info.color,
              }}
            />
          </div>
        </div>

        {/* Row 4: 3-dot approval step indicator */}
        <div className="flex items-center gap-1.5">
          <ApprovalDot
            active={info.step >= 1}
            color={info.color}
            label="Submit"
          />
          <ApprovalConnector active={info.step >= 2} color={info.color} />
          <ApprovalDot
            active={info.step >= 2}
            color={info.color}
            label="Sub-Admin"
          />
          <ApprovalConnector active={info.step >= 3} color={info.color} />
          <ApprovalDot
            active={info.step >= 3}
            color={info.color}
            label="Admin"
          />
          {isRejected ? (
            <span
              className="text-m-caption font-bold ml-1"
              style={{ color: "var(--color-stop)" }}
            >
              Rejected
            </span>
          ) : null}
        </div>
      </div>

      {/* Right — circular progress ring */}
      <div
        className="grid place-items-center w-14 shrink-0"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <ProgressRing
          pct={pct}
          color={isRejected ? "var(--color-stop)" : info.color}
        />
      </div>
    </Link>
  );

  // Wrap in SwipeableListItem if there are swipe actions, otherwise return as-is
  if (swipeActions.length > 0) {
    return (
      <SwipeableListItem actions={swipeActions} className="rounded-[0.625rem]">
        {card}
      </SwipeableListItem>
    );
  }
  return card;
}

/* ── Approval step dot ── */
function ApprovalDot({
  active,
  color,
  label,
}: {
  active: boolean;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: active ? color : "var(--color-concrete)",
        }}
      />
      <span
        className="text-m-caption font-semibold"
        style={{
          color: active ? "var(--color-ink-700)" : "var(--color-ink-400)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Connector line between dots ── */
function ApprovalConnector({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  return (
    <div
      className="h-px w-3"
      style={{ backgroundColor: active ? color : "var(--color-concrete)" }}
    />
  );
}

/* ── Circular progress ring (SVG arc) ── */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-concrete)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90"
        style={{
          transformOrigin: "center",
          fontSize: "9px",
          fontWeight: 700,
          fill: "var(--color-ink-950)",
          fontFamily: "system-ui",
        }}
      >
        {Math.round(pct)}
      </text>
    </svg>
  );
}

/* ── Date helpers ── */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
