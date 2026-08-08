"use client";

import { useState, useMemo } from "react";
import { KeyRound, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type RentalFilter = "ALL" | "ACTIVE" | "PENDING";

export type RentalListItem = {
  id: string;
  tenantName: string;
  status: string;
  assetLabel: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  hasOverdue: boolean;
};

const FILTER_CHIPS: { label: string; value: RentalFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending", value: "PENDING" },
];

/**
 * Client component for the mobile rentals list. Handles client-side
 * search (tenant name / asset label) + status filter chips. When no
 * filter/search is active, tenancies are shown grouped (Active →
 * Pending), matching the original layout. When a filter or search is
 * active, a flat result list is shown instead.
 *
 * Rows use MobileInfoRow (not tappable) because there is no mobile
 * tenancy detail page yet — but each row now carries a status badge.
 */
export function MobileRentalsList({ items }: { items: RentalListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RentalFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.tenantName.toLowerCase().includes(q) ||
          t.assetLabel.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search tenant, asset…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
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
function FlatList({ items }: { items: RentalListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={KeyRound}
        title="No matching rentals"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((t) => (
          <RentalRow key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default Active → Pending view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: RentalListItem[] }) {
  const active = items.filter((t) => t.status === "ACTIVE");
  const pending = items.filter((t) => t.status === "PENDING");

  return (
    <div>
      <MobileSectionTitle>Active Tenancies ({active.length})</MobileSectionTitle>
      {active.length === 0 ? (
        <MobileEmptyState icon={KeyRound} title="No active rentals" />
      ) : (
        <div>
          {active.map((t) => (
            <RentalRow key={t.id} t={t} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <>
          <MobileSectionTitle>Pending ({pending.length})</MobileSectionTitle>
          <div>
            {pending.map((t) => (
              <RentalRow key={t.id} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A single rental row — non-navigable, with a status + overdue badge. */
function RentalRow({ t }: { t: RentalListItem }) {
  const subtitle =
    t.status === "ACTIVE"
      ? `${t.assetLabel} · until ${formatDate(t.endDate)}`
      : `Starts ${formatDate(t.startDate)} · ${t.assetLabel}`;
  return (
    <MobileInfoRow
      icon={t.hasOverdue ? AlertTriangle : KeyRound}
      title={t.tenantName}
      subtitle={subtitle}
      value={formatCurrency(t.monthlyRent)}
      tone={t.hasOverdue ? "danger" : t.status === "ACTIVE" ? "success" : "warning"}
      badge={
        <div className="flex shrink-0 items-center gap-1">
          {t.hasOverdue && <MobileStatusBadge status="OVERDUE" />}
          <MobileStatusBadge status={t.status} />
        </div>
      }
    />
  );
}
