"use client";

import { useState, useMemo } from "react";
import { CalendarCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { MobileSectionTitle, MobileRow, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterChips, MobileNoResults } from "@/components/mobile/v2/scaffold";

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
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
        showClear={!!query}
        onClear={() => setQuery("")}
        filterChips={
          <MobileFilterChips
            chips={FILTER_CHIPS}
            active={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <MobileSectionTitle>Periods ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching payroll periods" hint="Try a different search or filter" />
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
