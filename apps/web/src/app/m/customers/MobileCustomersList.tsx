"use client";

import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type DuesFilter = "ALL" | "DUE" | "CLEAR";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  activeCount: number;
  totalValue: number;
  dueCount: number;
  paymentStatus: string;
};

const FILTER_CHIPS: { label: string; value: DuesFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "With Dues", value: "DUE" },
  { label: "Clear", value: "CLEAR" },
];

/**
 * Client component for the mobile customer list. Handles client-side
 * search (name / phone) + dues filter chips. When no filter/search is
 * active, customers are shown grouped (Outstanding → All), matching the
 * original layout. When a filter or search is active, a flat result list
 * is shown instead.
 */
export function MobileCustomersList({ items }: { items: CustomerListItem[] }) {
  const [query, setQuery] = useState("");
  const [duesFilter, setDuesFilter] = useState<DuesFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (duesFilter === "DUE") {
      result = result.filter((c) => c.dueCount > 0);
    } else if (duesFilter === "CLEAR") {
      result = result.filter((c) => c.dueCount === 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, duesFilter]);

  const isFiltering = query.trim() !== "" || duesFilter !== "ALL";

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by name, phone…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={duesFilter}
        onChange={setDuesFilter}
      />

      {isFiltering ? (
        <FlatList items={filtered} />
      ) : (
        <GroupedList items={items} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({ items }: { items: CustomerListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Users}
        title="No matching customers"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((c) => (
          <CustomerRow key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default Outstanding → All view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: CustomerListItem[] }) {
  const withDue = items.filter((c) => c.dueCount > 0);
  const clear = items.filter((c) => c.dueCount === 0);

  return (
    <div>
      {withDue.length > 0 && (
        <>
          <MobileSectionTitle>Outstanding Payments ({withDue.length})</MobileSectionTitle>
          <div>
            {withDue.map((c) => (
              <CustomerRow key={c.id} c={c} />
            ))}
          </div>
        </>
      )}

      <MobileSectionTitle>All Customers</MobileSectionTitle>
      {clear.length === 0 ? (
        <MobileEmptyState icon={Users} title="No clear customers" />
      ) : (
        <div>
          {clear.map((c) => (
            <CustomerRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single customer row with a payment-status badge and due-count meta. */
function CustomerRow({ c }: { c: CustomerListItem }) {
  return (
    <MobileRow
      href={`/m/customers/${c.id}`}
      icon={Users}
      title={c.name}
      subtitle={c.phone ?? "no phone"}
      meta={c.dueCount > 0 ? `${c.dueCount} due · ${formatCurrency(c.totalValue)}` : c.activeCount > 0 ? `${c.activeCount} sales` : undefined}
      badge={
        c.activeCount > 0 ? (
          <MobileStatusBadge
            status={c.paymentStatus}
            label={c.paymentStatus === "PAID" ? "Clear" : undefined}
          />
        ) : undefined
      }
    />
  );
}
