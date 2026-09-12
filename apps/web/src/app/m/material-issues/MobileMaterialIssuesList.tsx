"use client";

import { useState, useMemo } from "react";
import { Package } from "lucide-react";
import {
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { formatCurrency } from "@/lib/utils";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

export type MaterialIssueListItem = {
  id: string;
  issueNumber: string | null;
  date: string;
  status: string;
  projectName: string | null;
  departmentName: string | null;
  issuedByName: string | null;
  lineCount: number;
  totalValue: number;
  createdAt: string;
};

const STATUS_FILTERS = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/**
 * Client component for the paginated material issues list.
 * Renders the issue rows and a "Load More" button at the bottom.
 */
export function MobileMaterialIssuesList({
  initialItems,
  loadMoreUrl,
  initialCursor,
}: {
  initialItems: MaterialIssueListItem[];
  loadMoreUrl?: string;
  initialCursor?: string | null;
}) {
  const { items, loading, hasMore, loadMore } = usePaginatedList<MaterialIssueListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") result = result.filter((i) => i.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (i) =>
          (i.issueNumber?.toLowerCase().includes(q) ?? false) ||
          (i.projectName?.toLowerCase().includes(q) ?? false) ||
          (i.departmentName?.toLowerCase().includes(q) ?? false) ||
          (i.issuedByName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, statusFilter, query]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Package}
        title="No material issues yet"
        description="Stock issued to projects or departments will appear here."
      />
    );
  }

  return (
    <>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search issue #, project, department…"
        filterChips={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {STATUS_FILTERS.map((opt) => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className="px-2.5 py-1 text-m-body rounded-full border whitespace-nowrap transition-colors press"
                style={{
                  borderColor: statusFilter === opt ? "var(--color-steel)" : "var(--color-line)",
                  backgroundColor: statusFilter === opt ? "color-mix(in srgb, var(--color-steel) 10%, transparent)" : "transparent",
                  color: statusFilter === opt ? "var(--color-steel)" : "var(--color-ink-500)",
                }}
              >
                {STATUS_LABELS[opt]}
              </button>
            ))}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <MobileNoResults query={query} />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {filtered.map((issue) => {
            const target =
              issue.projectName ??
              issue.departmentName ??
              "—";
            const meta = `${new Date(issue.date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
             timeZone: "Asia/Kolkata" })} · ${issue.lineCount} item${issue.lineCount === 1 ? "" : "s"} · ${formatCurrency(issue.totalValue)}`;
            return (
              <MobileRow
                key={issue.id}
                href={`/m/material-issues/${issue.id}`}
                icon={Package}
                title={issue.issueNumber ?? "Issue"}
                subtitle={target}
                meta={meta}
                badge={
                  <MobileStatusBadge status={issue.status} />
                }
              />
            );
          })}
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
    </>
  );
}
