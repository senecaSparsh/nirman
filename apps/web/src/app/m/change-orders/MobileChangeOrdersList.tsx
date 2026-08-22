"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { GitBranch, Search, X, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";

export type ChangeOrderListItem = {
  id: string;
  changeOrderNo: string;
  title: string;
  status: string;
  type: string;
  reason: string;
  projectName: string;
  phaseName: string | null;
  lineCount: number;
  costDelta: number;
  scheduleDeltaDays: number;
  createdAt: string;
};

type COFilter = "ALL" | "DRAFT" | "SUBMITTED" | "APPROVED" | "IMPLEMENTED" | "REJECTED";

const FILTER_CHIPS: { label: string; value: COFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Pending", value: "SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Done", value: "IMPLEMENTED" },
  { label: "Rejected", value: "REJECTED" },
];

const TYPE_LABELS: Record<string, string> = {
  ADDITION: "Addition",
  DELETION: "Deletion",
  MODIFICATION: "Modification",
  ACCELERATION: "Acceleration",
  DECELERATION: "Deceleration",
  VARIATION: "Variation",
};

export function MobileChangeOrdersList({ items }: { items: ChangeOrderListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<COFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((c) => c.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.changeOrderNo.toLowerCase().includes(q) ||
          c.projectName.toLowerCase().includes(q),
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
            placeholder="Search change order…"
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
        <MobileEmptyState icon={GitBranch} title="No matching change orders" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <ChangeOrderCard key={c.id} co={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeOrderCard({ co: c }: { co: ChangeOrderListItem }) {
  const costDeltaPositive = c.costDelta > 0;
  const costDeltaNegative = c.costDelta < 0;
  return (
    <Link
      href={`/m/change-orders/${c.id}`}
      className="rounded-[0.5rem] border p-2.5 block press"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {c.changeOrderNo}
        </p>
        <MobileStatusBadge status={c.status} />
      </div>
      <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
        {c.title}
      </p>
      <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {TYPE_LABELS[c.type] ?? c.type} · {c.projectName}{c.phaseName ? ` · ${c.phaseName}` : ""}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Lines</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {c.lineCount}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cost Δ</p>
          <p
            className="text-[0.625rem] font-bold tabular-nums flex items-center gap-0.5"
            style={{
              color: costDeltaPositive ? "var(--color-stop)" : costDeltaNegative ? "var(--color-go)" : "var(--color-ink-950)",
            }}
          >
            {costDeltaPositive && <ArrowUpRight className="size-3" />}
            {costDeltaNegative && <ArrowDownRight className="size-3" />}
            {formatCurrency(Math.abs(c.costDelta))}
          </p>
        </div>
        {c.scheduleDeltaDays !== 0 && (
          <>
            <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
            <div>
              <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Schedule</p>
              <p className="text-[0.625rem] font-bold tabular-nums flex items-center gap-0.5" style={{ color: "var(--color-ink-950)" }}>
                <Clock className="size-3" />
                {c.scheduleDeltaDays > 0 ? "+" : ""}{c.scheduleDeltaDays}d
              </p>
            </div>
          </>
        )}
        <div className="ml-auto text-right">
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Created</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(c.createdAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}
