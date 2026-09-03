"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Receipt, Plus, Clock, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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
  items,
  totalAmount,
  pendingCount,
  canApprove,
  canCreate,
}: {
  items: ExpenseClaimListItem[];
  totalAmount: number;
  pendingCount: number;
  canApprove?: boolean;
  canCreate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

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
        description="Employee reimbursement claims will appear here once submitted."
        action={
          canCreate ? (
            <Link href="/expense-claims" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-body font-medium text-brand-foreground">
              <Plus className="size-4" /> New Claim
            </Link>
          ) : undefined
        }
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
        {filtered.map((claim) => {
          const meta = STATUS_META[claim.status] ?? { label: claim.status, icon: Receipt, color: "text-muted-foreground" };
          const StatusIcon = meta.icon;
          return (
            <Link
              key={claim.id}
              href={`/expense-claims?open=${claim.id}`}
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
          );
        })}
      </MobileCardGrid>
      {filtered.length === 0 && <MobileNoResults query={query} />}
    </div>
  );
}
