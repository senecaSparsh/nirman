"use client";

import { useState, useMemo } from "react";
import { Landmark } from "lucide-react";
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

export type SupplierListItem = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  poCount: number;
  balanceOwed: number;
};

const FILTER_CHIPS: { label: string; value: DuesFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "With Dues", value: "DUE" },
  { label: "Clear", value: "CLEAR" },
];

/**
 * Client component for the mobile supplier list. Handles client-side
 * search (name / GSTIN / phone) + dues filter chips. When no
 * filter/search is active, suppliers are shown grouped (Outstanding →
 * All), matching the original layout. When a filter or search is active,
 * a flat result list is shown instead.
 */
export function MobileSuppliersList({ items }: { items: SupplierListItem[] }) {
  const [query, setQuery] = useState("");
  const [duesFilter, setDuesFilter] = useState<DuesFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (duesFilter === "DUE") {
      result = result.filter((s) => s.balanceOwed > 0);
    } else if (duesFilter === "CLEAR") {
      result = result.filter((s) => s.balanceOwed === 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.gstin?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false),
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
        placeholder="Search name, GSTIN, phone…"
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
function FlatList({ items }: { items: SupplierListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Landmark}
        title="No matching suppliers"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((s) => (
          <SupplierRow key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default Outstanding → All view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: SupplierListItem[] }) {
  const withDues = items.filter((s) => s.balanceOwed > 0);
  const clear = items.filter((s) => s.balanceOwed === 0);

  return (
    <div>
      {withDues.length > 0 && (
        <>
          <MobileSectionTitle>Outstanding Dues ({withDues.length})</MobileSectionTitle>
          <div>
            {withDues.map((s) => (
              <SupplierRow key={s.id} s={s} />
            ))}
          </div>
        </>
      )}

      <MobileSectionTitle>All Suppliers</MobileSectionTitle>
      {clear.length === 0 ? (
        <MobileEmptyState icon={Landmark} title="No clear suppliers" />
      ) : (
        <div>
          {clear.map((s) => (
            <SupplierRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single supplier row with a dues badge and owed-amount meta. */
function SupplierRow({ s }: { s: SupplierListItem }) {
  const hasDues = s.balanceOwed > 0;
  return (
    <MobileRow
      href={`/suppliers/${s.id}`}
      icon={Landmark}
      title={s.name}
      subtitle={`${s.gstin ?? "No GSTIN"} · ${s.phone ?? "No phone"} · ${s.poCount} POs`}
      meta={hasDues ? formatCurrency(s.balanceOwed) : undefined}
      badge={
        hasDues ? (
          <MobileStatusBadge status="PENDING" label="Due" />
        ) : s.poCount > 0 ? (
          <MobileStatusBadge status="CLEAR" label="Clear" />
        ) : undefined
      }
    />
  );
}
