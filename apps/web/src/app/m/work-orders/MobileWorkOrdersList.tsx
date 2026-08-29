"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export type WorkOrderListItem = {
  id: string;
  workOrderNumber: string;
  workTitle: string;
  status: string;
  subcontractorName: string;
  subcontractorTrade: string | null;
  projectName: string;
  lineCount: number;
  raBillCount: number;
  startDate: string | null;
  endDate: string | null;
  retentionPct: number;
  advanceAmount: number | null;
};

type WOFilter = "ALL" | "DRAFT" | "ACTIVE" | "COMPLETED";

const FILTER_CHIPS: { label: string; value: WOFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
];

export function MobileWorkOrdersList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: WorkOrderListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WOFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "ACTIVE") result = result.filter((w) => w.status === "ACTIVE" || w.status === "ISSUED");
    else if (filter === "COMPLETED") result = result.filter((w) => w.status === "COMPLETED" || w.status === "CLOSED");
    else if (filter !== "ALL") result = result.filter((w) => w.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (w) =>
          w.workTitle.toLowerCase().includes(q) ||
          w.subcontractorName.toLowerCase().includes(q) ||
          w.workOrderNumber.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, filter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={ClipboardList}
        title="No work orders"
        hint="Work orders will appear here"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search work order…"
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
        showClear={query !== "" || filter !== "ALL"}
        onClear={() => {
          setQuery("");
          setFilter("ALL");
        }}
      />

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching work orders" hint="Try a different search or filter" />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} order{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {filtered.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function WorkOrderCard({ wo: w }: { wo: WorkOrderListItem }) {
  return (
    <Link
      href={`/m/work-orders/${w.id}`}
      className="block rounded-[0.5rem] border p-2.5 text-m-body press"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {w.workOrderNumber}
        </p>
        <MobileStatusBadge status={w.status} />
      </div>
      <p className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
        {w.workTitle}
      </p>
      <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {w.subcontractorName}{w.subcontractorTrade ? ` · ${w.subcontractorTrade}` : ""} · {w.projectName}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Scope</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {w.lineCount} {w.lineCount === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>RA Bills</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {w.raBillCount}
          </p>
        </div>
        {w.startDate && (
          <>
            <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
            <div className="ml-auto text-right">
              <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Start</p>
              <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatDate(w.startDate)}
              </p>
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
