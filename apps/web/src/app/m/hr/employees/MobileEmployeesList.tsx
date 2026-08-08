"use client";

import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type WageTypeFilter = "ALL" | "DAILY" | "MONTHLY";

export type EmployeeListItem = {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  phone: string | null;
  dailyRate: string | null;
  monthlySalary: string | null;
  wageType: string;
  activeProjectName: string | null;
};

const FILTER_CHIPS: { label: string; value: WageTypeFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Daily", value: "DAILY" },
  { label: "Monthly", value: "MONTHLY" },
];

/**
 * Client component for the mobile employee list. Handles client-side
 * search (name / trade / designation) + wage-type filter chips. When no
 * filter/search is active, employees are shown grouped by trade (the
 * original layout). When a filter or search is active, a flat result
 * list is shown instead.
 *
 * Employees are not tappable — there is no mobile employee detail page,
 * so they render as `MobileInfoRow` (non-navigable) with a wage-type
 * badge.
 */
export function MobileEmployeesList({
  items,
}: {
  items: EmployeeListItem[];
}) {
  const [query, setQuery] = useState("");
  const [wageFilter, setWageFilter] = useState<WageTypeFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (wageFilter !== "ALL") {
      result =
        wageFilter === "DAILY"
          ? result.filter((e) => e.wageType === "DAILY")
          : result.filter((e) => e.wageType !== "DAILY");
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.trade?.toLowerCase().includes(q) ?? false) ||
          (e.designation?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, wageFilter]);

  const isFiltering = query.trim() !== "" || wageFilter !== "ALL";

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by name, trade, designation…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={wageFilter}
        onChange={setWageFilter}
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
function FlatList({ items }: { items: EmployeeListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Users}
        title="No matching employees"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((e) => (
          <EmployeeRow key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default trade-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: EmployeeListItem[] }) {
  const trades = [...new Set(items.map((e) => e.trade).filter(Boolean))] as string[];

  return (
    <div>
      <MobileSectionTitle>By Trade</MobileSectionTitle>
      {trades.map((trade) => {
        const tradeWorkers = items.filter((e) => e.trade === trade);
        return (
          <div key={trade}>
            <div className="px-4 pb-1 pt-2 text-caption font-medium text-muted-foreground">
              {trade} ({tradeWorkers.length})
            </div>
            {tradeWorkers.map((e) => (
              <EmployeeRow key={e.id} e={e} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A single employee row — non-navigable (no mobile detail page) with badge. */
function EmployeeRow({ e }: { e: EmployeeListItem }) {
  const wage =
    e.wageType === "DAILY"
      ? `${formatCurrency(e.dailyRate)}/day`
      : formatCurrency(e.monthlySalary);
  return (
    <MobileInfoRow
      icon={Users}
      title={e.name}
      subtitle={`${e.designation ?? "—"} · ${e.activeProjectName ?? "No project"}${e.phone ? ` · ${e.phone}` : ""}`}
      value={wage}
      badge={<MobileStatusBadge status={e.wageType} />}
    />
  );
}
