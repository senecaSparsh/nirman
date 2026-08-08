"use client";

import { useState, useMemo } from "react";
import { Undo2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

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
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by return no, supplier, CN…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

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
        <div>
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
