"use client";

import { useState, useMemo } from "react";
import { CalendarOff } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export type LeaveListItem = {
  id: string;
  employeeName: string;
  employeeTrade: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  days: number;
};

type LeaveFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const FILTER_CHIPS: { label: string; value: LeaveFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
  UNPAID: "Unpaid",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
};

export function MobileLeavesList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: LeaveListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LeaveFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((l) => l.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (l) =>
          l.employeeName.toLowerCase().includes(q) ||
          (l.employeeTrade?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, filter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={CalendarOff}
        title="No leave requests"
        hint="Leave requests will appear here"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search employee…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={filter}
              defaultValue="ALL"
              onChange={setFilter}
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
        showClear={!!query || filter !== "ALL"}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* List */}
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching leave records" hint="Try a different search or filter" />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} leave{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {filtered.map((l) => (
            <LeaveCard key={l.id} leave={l} />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function LeaveCard({ leave: l }: { leave: LeaveListItem }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {l.employeeName}
        </p>
        <MobileStatusBadge status={l.status} />
      </div>
      <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {l.employeeTrade ?? "—"} · {LEAVE_TYPE_LABELS[l.type] ?? l.type}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Dates</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(l.startDate)} → {formatDate(l.endDate)}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Days</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {l.days}
          </p>
        </div>
      </div>
      {l.reason && (
        <p className="text-m-caption mt-1.5" style={{ color: "var(--color-ink-500)" }}>
          {l.reason}
        </p>
      )}
    </div>
  );
}
