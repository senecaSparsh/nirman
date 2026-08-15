"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";

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

export function MobileLeavesList({ items }: { items: LeaveListItem[] }) {
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
            placeholder="Search employee…"
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

      {/* List */}
      {filtered.length === 0 ? (
        <MobileEmptyState icon={CalendarDays} title="No matching leave records" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((l) => (
            <LeaveCard key={l.id} leave={l} />
          ))}
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
        <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {l.employeeName}
        </p>
        <MobileStatusBadge status={l.status} />
      </div>
      <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {l.employeeTrade ?? "—"} · {LEAVE_TYPE_LABELS[l.type] ?? l.type}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Dates</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(l.startDate)} → {formatDate(l.endDate)}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Days</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {l.days}
          </p>
        </div>
      </div>
      {l.reason && (
        <p className="text-[0.5rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>
          {l.reason}
        </p>
      )}
    </div>
  );
}
