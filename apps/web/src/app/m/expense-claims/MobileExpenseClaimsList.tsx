"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, Clock, CheckCircle2, XCircle, Eye, Share2, User, Calendar, IndianRupee, Tag, FileText } from "lucide-react";
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
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

export type ExpenseClaimListItem = {
  id: string;
  claimantName: string;
  projectName: string | null;
  status: string;
  totalAmount: number;
  submittedAt: string;
  description: string | null;
};

const STATUS_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  DRAFT: { label: "Draft", icon: Receipt, color: "text-muted-foreground" },
  SUBMITTED: { label: "Pending", icon: Clock, color: "text-warning" },
  APPROVED: { label: "Approved", icon: CheckCircle2, color: "text-success" },
  PAID: { label: "Paid", icon: CheckCircle2, color: "text-success" },
  REJECTED: { label: "Rejected", icon: XCircle, color: "text-danger" },
};

export function MobileExpenseClaimsList({
  items: initialItems,
  totalAmount,
  pendingCount,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canApprove,
  canCreate,
  loadMoreUrl,
  initialCursor,
}: {
  items: ExpenseClaimListItem[];
  totalAmount: number;
  pendingCount: number;
  canApprove?: boolean;
  canCreate?: boolean;
  loadMoreUrl?: string;
  initialCursor?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { items, loading, hasMore, loadMore } = usePaginatedList<ExpenseClaimListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const statusOptions = useMemo(() => {
    const set = new Set(items.map((c) => c.status));
    return [
      { label: "All", value: "ALL" },
      ...Array.from(set).map((s) => ({ label: STATUS_META[s]?.label ?? s, value: s })),
    ];
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") result = result.filter((c) => c.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.claimantName.toLowerCase().includes(q) ||
          (c.projectName?.toLowerCase().includes(q) ?? false) ||
          (c.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const stats: SummaryStat[] = [
    { label: "Total", value: formatCurrencyCompact(totalAmount) },
    { label: "Claims", value: String(items.length) },
    { label: "Pending", value: String(pendingCount), tone: pendingCount > 0 ? "signal" : "default" },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Receipt}
        title="No expense claims"
        hint={canCreate ? "Tap + to submit your first claim" : "Employee reimbursement claims will appear here once submitted."}
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search claims…"
        action={
          <MobileFilterIcon
            options={statusOptions}
            active={statusFilter}
            defaultValue="ALL"
            onChange={setStatusFilter}
          />
        }
      />
      <MobileSummaryStrip stats={stats} />
      <MobileCardGrid>
        {filtered.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </MobileCardGrid>
      {filtered.length === 0 && <MobileNoResults query={query} />}
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

/* ─── Claim card — long-press opens overview sheet ─── */
function ClaimCard({ claim }: { claim: ExpenseClaimListItem }) {
  const router = useRouter();
  const meta = STATUS_META[claim.status] ?? { label: claim.status, icon: Receipt, color: "text-muted-foreground" };
  const StatusIcon = meta.icon;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: User, label: "Claimant", value: claim.claimantName },
    { icon: Calendar, label: "Date", value: formatDate(claim.submittedAt) },
    { icon: IndianRupee, label: "Amount", value: formatCurrency(claim.totalAmount) },
    { icon: Receipt, label: "Status", value: meta.label },
    { icon: Tag, label: "Project", value: claim.projectName ?? "—" },
    { icon: Calendar, label: "Submitted", value: formatDate(claim.submittedAt) },
    { icon: FileText, label: "Description", value: claim.description ?? "—" },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/expense-claims/${claim.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/expense-claims/${claim.id}`;
        if (navigator.share) {
          navigator.share({ title: claim.claimantName, url }).catch(() => {});
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
          href={`/m/expense-claims/${claim.id}`}
          className="block rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors active:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-foreground">{claim.claimantName}</p>
              {claim.projectName && (
                <p className="mt-0.5 truncate text-caption text-muted-foreground">{claim.projectName}</p>
              )}
            </div>
            <div className="text-right">
              <p className="tnum text-body font-semibold text-foreground">{formatCurrencyCompact(claim.totalAmount)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className={`flex items-center gap-1 text-caption ${meta.color}`}>
              <StatusIcon className="size-3" />
              {meta.label}
            </div>
            <span className="text-caption text-muted-foreground">{formatDate(claim.submittedAt)}</span>
          </div>
        </Link>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={claim.claimantName}
        subtitle={formatCurrency(claim.totalAmount)}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
