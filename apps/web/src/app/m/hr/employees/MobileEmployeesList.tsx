"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Users, HardHat, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
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
  onboardingComplete?: boolean;
  employeeCode?: string | null;
  active?: boolean;
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
  viewerHierarchyLevel: _viewerHierarchyLevel,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: EmployeeListItem[];
  // TODO: use viewerHierarchyLevel for per-row action gating (e.g. edit/delete
  // buttons when added). Currently the mobile list only navigates to the
  // employee detail page, so no per-row action gating is needed yet.
  viewerHierarchyLevel?: number | null;
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

  // Onboarding status counts
  const pendingCount = items.filter((e) => e.active !== false && e.onboardingComplete === false).length;
  const onboardedCount = items.filter((e) => e.active !== false && e.onboardingComplete === true).length;
  const inactiveCount = items.filter((e) => e.active === false).length;

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={HardHat}
        title="No employees"
        hint="Employees will appear here once added"
      />
    );
  }

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

      {/* ── Onboarding status summary ── */}
      {(pendingCount > 0 || inactiveCount > 0) && (
        <div className="flex items-center gap-2 px-4 pb-2">
          {pendingCount > 0 && (
            <Link
              href="/m/hr/onboarding"
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-m-caption font-bold press"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
                color: "var(--color-signal-dark)",
              }}
            >
              <Clock className="size-3" />
              {pendingCount} pending onboarding
            </Link>
          )}
          {inactiveCount > 0 && (
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-m-caption font-bold"
              style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
            >
              <AlertCircle className="size-3" />
              {inactiveCount} inactive
            </span>
          )}
          {onboardedCount > 0 && (
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-m-caption font-bold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)",
                color: "var(--color-go)",
              }}
            >
              <CheckCircle2 className="size-3" />
              {onboardedCount} onboarded
            </span>
          )}
        </div>
      )}

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
 * Employees without a trade are shown in an "Other" group so nobody
 * is hidden just because they don't have a trade assigned.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: EmployeeListItem[] }) {
  const trades = [...new Set(items.map((e) => e.trade).filter(Boolean))] as string[];
  const ungrouped = items.filter((e) => !e.trade);

  return (
    <div>
      <MobileSectionTitle>By Trade</MobileSectionTitle>
      {trades.map((trade) => {
        const tradeWorkers = items.filter((e) => e.trade === trade);
        return (
          <div key={trade}>
            <div
              className="pb-1 pt-2 text-m-caption font-bold uppercase tracking-wide"
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
      {ungrouped.length > 0 && (
        <div>
          <div
            className="pb-1 pt-2 text-m-caption font-bold uppercase tracking-wide"
            style={{ color: "var(--color-ink-500)" }}
          >
            Other ({ungrouped.length})
          </div>
          <div className="flex flex-col gap-2.5">
            {ungrouped.map((e) => (
              <EmployeeRow key={e.id} e={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A single employee row — navigable (links to employee detail page) with badge. */
function EmployeeRow({ e }: { e: EmployeeListItem }) {
  const wage =
    e.wageType === "DAILY"
      ? `${formatCurrency(e.dailyRate)}/day`
      : formatCurrency(e.monthlySalary);
  const subtitleParts = [
    e.employeeCode ?? null,
    e.designation ?? null,
    e.activeProjectName ?? null,
    e.phone ?? null,
  ].filter(Boolean);

  // Status badge: Onboarding Pending (amber) | Onboarded (green) | Inactive (grey)
  let badge: React.ReactNode;
  if (e.active === false) {
    badge = (
      <span
        className="text-micro font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
        style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
      >
        <AlertCircle className="size-2.5" />
        Inactive
      </span>
    );
  } else if (e.onboardingComplete === false) {
    badge = (
      <span
        className="text-micro font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
          color: "var(--color-signal-dark)",
        }}
      >
        <Clock className="size-2.5" />
        Onboarding Pending
      </span>
    );
  } else {
    badge = (
      <span
        className="text-micro font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)",
          color: "var(--color-go)",
        }}
      >
        <CheckCircle2 className="size-2.5" />
        Onboarded
      </span>
    );
  }

  return (
    <MobileRow
      href={`/m/hr/employees/${e.id}`}
      icon={Users}
      title={e.name}
      empId={e.id}
      subtitle={subtitleParts.join(" · ") || "—"}
      meta={wage}
      badge={badge}
    />
  );
}
