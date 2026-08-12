"use client";

import { useState, useMemo } from "react";
import { CalendarCheck, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { MobileSectionTitle, MobileRow, MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";

export type PayrollListItem = {
  id: string;
  month: number;
  year: number;
  monthLabel: string;
  status: string;
  totalNet: number;
  totalGross: number;
};

type PayrollFilter = "ALL" | "DRAFT" | "PAID" | "PROCESSED";

const FILTER_CHIPS: { label: string; value: PayrollFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Paid", value: "PAID" },
  { label: "Processed", value: "PROCESSED" },
];

/**
 * Client component for the mobile payroll list. Handles client-side
 * search by month/year (e.g. "Jan 2024", "2024") and status filter
 * chips (All / Draft / Paid / Processed). Each row shows a coloured
 * MobileStatusBadge instead of plain text.
 */
export function MobilePayrollList({ items }: { items: PayrollListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayrollFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.monthLabel.toLowerCase().includes(q) ||
          String(p.year).includes(q) ||
          String(p.month).includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }} />
          {query && <button onClick={() => setQuery("")} className="press"><X className="size-4" style={{ color: "var(--color-ink-300)" }} /></button>}
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return <button key={chip.value} onClick={() => setStatusFilter(chip.value)}
            className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap transition-colors"
            style={{ backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)", color: active ? "#fff" : "var(--color-ink-500)" }}>
            {chip.label}
          </button>;
        })}
      </div>

      <MobileSectionTitle>Periods ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={CalendarCheck} title="No matching payroll periods" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => (
            <MobileRow
              key={p.id}
              icon={CalendarCheck}
              title={p.monthLabel}
              subtitle={`gross ${formatCurrency(p.totalGross)}`}
              meta={formatCurrency(p.totalNet)}
              badge={<MobileStatusBadge status={p.status} />}
              tone={p.status === "PAID" ? "success" : p.status === "DRAFT" ? "warning" : "default"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
