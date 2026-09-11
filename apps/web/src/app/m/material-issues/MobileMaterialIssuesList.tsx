"use client";

import { Package } from "lucide-react";
import {
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
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
      <div className="flex flex-col gap-2 px-4">
        {items.map((issue) => {
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
