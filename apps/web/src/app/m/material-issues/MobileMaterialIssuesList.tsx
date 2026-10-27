"use client";

import { useState, useMemo, Suspense } from "react";
import { useUrlFilter } from "@/lib/use-url-filter";
import { Package } from "lucide-react";
import {
  MobileRow,
  MobileStatusBadge,

} from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults, MobileFilterDropdown } from "@/components/mobile/v2/scaffold";
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

// Must match the real MaterialIssueStatus enum — PENDING (awaiting gate
// pass) / COMPLETED / CANCELLED. The flow map's "PENDING" filter chip also
// lands here via ?status=PENDING.
const STATUS_FILTERS = ["ALL", "PENDING", "COMPLETED", "CANCELLED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Client component for the paginated material issues list.
 * Renders the issue rows and a "Load More" button at the bottom.
 */
export function MobileMaterialIssuesList(props: {
  initialItems: MaterialIssueListItem[];
  loadMoreUrl?: string;
  initialCursor?: string | null;
}) {
  // Suspense — useUrlFilter/useSearchParams requires it
  return (
    <Suspense fallback={null}>
      <MobileMaterialIssuesListInner {...props} />
    </Suspense>
  );
}

function MobileMaterialIssuesListInner({
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
  const [statusFilter, setStatusFilter] = useUrlFilter<StatusFilter>("status", "ALL");

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

  // Group by project (fall back to department) so a long list across many
  // projects stays scannable — same section convention as DPRs.
  const grouped = useMemo(() => {
    const groups: { label: string; items: MaterialIssueListItem[] }[] = [];
    const map = new Map<string, MaterialIssueListItem[]>();
    for (const i of filtered) {
      const label = i.projectName ?? i.departmentName ?? "General";
      let g = map.get(label);
      if (!g) {
        g = [];
        map.set(label, g);
        groups.push({ label, items: g });
      }
      g.push(i);
    }
    return groups;
  }, [filtered]);

  // Parent page renders its own empty state with an "Issue Materials" CTA.
  if (items.length === 0) return null;

  return (
    <>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search issue #, project, department…"
        action={
          <MobileFilterDropdown
            label="Status"
            options={STATUS_FILTERS.map((opt) => ({ label: STATUS_LABELS[opt], value: opt }))}
            active={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      {filtered.length === 0 ? (
        <MobileNoResults query={query} />
      ) : (
        <div className="flex flex-col gap-4 px-4">
          {grouped.map((group) => (
            <div key={group.label}>
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
                  {group.items.length} issue{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map((issue) => {
                  const subtitle =
                    issue.projectName && issue.departmentName
                      ? issue.departmentName
                      : (issue.issuedByName ?? "");
                  const metaSub = `${new Date(issue.date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                   timeZone: "Asia/Kolkata" })} · ${issue.lineCount} item${issue.lineCount === 1 ? "" : "s"}`;
                  return (
                    <MobileRow
                      key={issue.id}
                      href={`/m/material-issues/${issue.id}`}
                      icon={Package}
                      title={issue.issueNumber ?? "Issue"}
                      subtitle={subtitle}
                      meta={formatCurrency(issue.totalValue)}
                      metaSub={metaSub}
                      badge={
                        <MobileStatusBadge status={issue.status} />
                      }
                    />
                  );
                })}
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
    </>
  );
}
