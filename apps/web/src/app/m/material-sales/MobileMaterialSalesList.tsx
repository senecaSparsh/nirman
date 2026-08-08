"use client";

import { useState, useMemo } from "react";
import { Recycle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type SaleFilter = "ALL" | "ACTIVE" | "CANCELLED" | "PENDING" | "PAID";

export type MaterialSaleItem = {
  id: string;
  saleNumber: string;
  status: string;
  paymentStatus: string;
  saleDate: string;
  totalAmount: number;
  grossProfit: number;
  customerName: string | null;
  projectName: string | null;
};

const FILTER_CHIPS: { label: string; value: SaleFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending Pay", value: "PENDING" },
  { label: "Paid", value: "PAID" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Client component for the material sales list. Handles
 * client-side search + status/payment filter chips.
 */
export function MobileMaterialSalesList({ items }: { items: MaterialSaleItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SaleFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "ACTIVE") result = result.filter((s) => s.status === "ACTIVE");
    else if (filter === "CANCELLED") result = result.filter((s) => s.status === "CANCELLED");
    else if (filter === "PENDING") result = result.filter((s) => s.paymentStatus === "PENDING" && s.status === "ACTIVE");
    else if (filter === "PAID") result = result.filter((s) => s.paymentStatus === "PAID" && s.status === "ACTIVE");
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.saleNumber.toLowerCase().includes(q) ||
          (s.customerName?.toLowerCase().includes(q) ?? false) ||
          (s.projectName?.toLowerCase().includes(q) ?? false) ||
          s.status.toLowerCase().includes(q) ||
          s.paymentStatus.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, filter]);

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by sale no, customer, project…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={filter}
        onChange={setFilter}
      />

      <MobileSectionTitle>
        {query || filter !== "ALL"
          ? `Results (${filtered.length})`
          : "Recent Sales"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={Recycle}
          title="No matching sales"
          hint="Try a different search or filter"
        />
      ) : (
        <div>
          {filtered.map((s) => (
            <MobileRow
              key={s.id}
              href={`/m/material-sales/${s.id}`}
              icon={Recycle}
              title={s.saleNumber}
              subtitle={`${s.customerName ?? "—"} · ${formatDate(new Date(s.saleDate))}${s.projectName ? ` · ${s.projectName}` : ""}`}
              meta={formatCurrency(s.totalAmount)}
              badge={
                s.status === "CANCELLED" ? (
                  <MobileStatusBadge status={s.status} />
                ) : (
                  <MobileStatusBadge status={s.paymentStatus} />
                )
              }
              tone={s.status === "CANCELLED" ? "danger" : s.paymentStatus === "PENDING" ? "warning" : "success"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
