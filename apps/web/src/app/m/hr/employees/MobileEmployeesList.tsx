"use client";

import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
 * Employees are tappable — each row links to the mobile employee detail
 * page at /m/hr/employees/[id], rendered as `MobileRow` (navigable) with
 * a wage-type badge.
 */
export function MobileEmployeesList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: EmployeeListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
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
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={wageFilter}
              defaultValue="ALL"
              onChange={(v) => setWageFilter(v as WageTypeFilter)}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query || wageFilter !== "ALL"}
        onClear={() => { setQuery(""); setWageFilter("ALL"); }}
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
      <MobileNoResults title="No matching employees" hint="Try a different search or filter" />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
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
            <div
              className="pb-1 pt-2 text-[0.5625rem] font-bold uppercase tracking-wide"
              style={{ color: "var(--color-ink-500)" }}
            >
              {trade} ({tradeWorkers.length})
            </div>
            <div className="flex flex-col gap-2.5">
              {tradeWorkers.map((e) => (
                <EmployeeRow key={e.id} e={e} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single employee row — navigable (links to employee detail page) with badge. */
function EmployeeRow({ e }: { e: EmployeeListItem }) {
  const wage =
    e.wageType === "DAILY"
      ? `${formatCurrency(e.dailyRate)}/day`
      : formatCurrency(e.monthlySalary);
  return (
    <MobileRow
      href={`/m/hr/employees/${e.id}`}
      icon={Users}
      title={e.name}
      subtitle={`${e.designation ?? "—"} · ${e.activeProjectName ?? "No project"}${e.phone ? ` · ${e.phone}` : ""}`}
      meta={wage}
      badge={<MobileStatusBadge status={e.wageType} />}
    />
  );
}
