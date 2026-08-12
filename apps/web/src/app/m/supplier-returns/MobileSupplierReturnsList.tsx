"use client";

import { useState, useMemo } from "react";
import { Undo2, Search, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

type ReturnStatus = "ALL" | "DRAFT" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type SupplierReturnItem = {
  id: string;
  returnNumber: string;
  status: string;
  returnDate: string;
  creditNoteNo: string | null;
  supplierName: string;
  totalValue: number;
};

const FILTER_CHIPS: { label: string; value: ReturnStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Client component for the supplier returns list. Handles
 * client-side search + status filter chips.
 */
export function MobileSupplierReturnsList({ items }: { items: SupplierReturnItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReturnStatus>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.creditNoteNo?.toLowerCase().includes(q) ?? false) ||
          r.status.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) return null;

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

      <MobileSectionTitle>
        {query || statusFilter !== "ALL"
          ? `Results (${filtered.length})`
          : "Recent"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={Undo2}
          title="No matching returns"
          hint="Try a different search or filter"
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <MobileRow
              key={r.id}
              href={`/m/supplier-returns/${r.id}`}
              icon={Undo2}
              title={r.returnNumber}
              subtitle={`${r.supplierName} · ${formatDate(new Date(r.returnDate))}${r.creditNoteNo ? ` · CN: ${r.creditNoteNo}` : ""}`}
              meta={formatCurrency(r.totalValue)}
              badge={<MobileStatusBadge status={r.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
