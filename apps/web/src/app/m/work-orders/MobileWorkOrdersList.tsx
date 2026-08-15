"use client";

import { useState, useMemo } from "react";
import { Wrench, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";

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

export function MobileWorkOrdersList({ items }: { items: WorkOrderListItem[] }) {
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

  if (items.length === 0) return null;

  return (
    <div>
      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work order…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press">
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setFilter(chip.value)}
              className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap transition-colors"
              style={{
                backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)",
                color: active ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState icon={Wrench} title="No matching work orders" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkOrderCard({ wo: w }: { wo: WorkOrderListItem }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {w.workOrderNumber}
        </p>
        <MobileStatusBadge status={w.status} />
      </div>
      <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
        {w.workTitle}
      </p>
      <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {w.subcontractorName}{w.subcontractorTrade ? ` · ${w.subcontractorTrade}` : ""} · {w.projectName}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Scope</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {w.lineCount} {w.lineCount === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>RA Bills</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {w.raBillCount}
          </p>
        </div>
        {w.startDate && (
          <>
            <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
            <div className="ml-auto text-right">
              <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Start</p>
              <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatDate(w.startDate)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
