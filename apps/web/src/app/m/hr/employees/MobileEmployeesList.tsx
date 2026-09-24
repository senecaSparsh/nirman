"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, CheckCircle2, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { useConfirm } from "@/lib/use-confirm";

type WageTypeFilter = "ALL" | "DAILY" | "MONTHLY" | "ARCHIVED";

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
  archived?: boolean;
};

const FILTER_CHIPS: { label: string; value: WageTypeFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Daily", value: "DAILY" },
  { label: "Monthly", value: "MONTHLY" },
  { label: "Archived", value: "ARCHIVED" },
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
  canManage = false,
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
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [wageFilter, setWageFilter] = useState<WageTypeFilter>("ALL");
  // Archived view fetches soft-deleted records on demand (the server-fed
  // `items` only carries live rows).
  const [archivedItems, setArchivedItems] = useState<EmployeeListItem[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();

  React.useEffect(() => {
    if (wageFilter !== "ARCHIVED" || archivedItems !== null) return;
    setArchivedLoading(true);
    fetch("/api/employees?archived=true")
      .then((r) => r.json())
      .then((rows) => setArchivedItems(Array.isArray(rows) ? rows : []))
      .catch(() => setArchivedItems([]))
      .finally(() => setArchivedLoading(false));
  }, [wageFilter, archivedItems]);

  async function restoreEmployee(id: string, name: string) {
    if (!(await confirm({
      title: `Restore ${name}?`,
      description: "They'll be re-activated and can log in again.",
      confirmLabel: "Restore",
    }))) return;
    setRestoring(id);
    try {
      const res = await fetch(`/api/employees/${id}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      toast.success(`${name} restored`);
      setArchivedItems((prev) => prev?.filter((e) => e.id !== id) ?? null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  const filtered = useMemo(() => {
    let result = wageFilter === "ARCHIVED" ? (archivedItems ?? []) : items;
    if (wageFilter === "DAILY") {
      result = result.filter((e) => e.wageType === "DAILY");
    } else if (wageFilter === "MONTHLY") {
      result = result.filter((e) => e.wageType !== "DAILY");
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
  }, [items, archivedItems, query, wageFilter]);

  const isFiltering = query.trim() !== "" || wageFilter !== "ALL";

  // Onboarding status counts
  const pendingCount = items.filter((e) => e.active !== false && e.onboardingComplete === false).length;
  const onboardedCount = items.filter((e) => e.active !== false && e.onboardingComplete === true).length;
  const inactiveCount = items.filter((e) => e.active === false).length;

  // Never early-return on an empty live list — the Archived chip must stay
  // reachable for companies whose only employees are archived.

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
      {(inactiveCount > 0 || onboardedCount > 0) && (
        <div className="flex items-center gap-2 px-4 pb-2">
          {inactiveCount > 0 && (
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-m-caption font-bold"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
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

      {wageFilter === "ARCHIVED" && archivedLoading ? (
        <p className="px-4 py-6 text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Loading archived employees…</p>
      ) : isFiltering ? (
        <FlatList items={filtered} archivedMode={wageFilter === "ARCHIVED"} restoring={restoring} onRestore={canManage ? restoreEmployee : undefined} />
      ) : (
        <GroupedList items={items} pendingCount={pendingCount} />
      )}
      {confirmDialog}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({
  items,
  archivedMode,
  restoring,
  onRestore,
}: {
  items: EmployeeListItem[];
  archivedMode?: boolean;
  restoring?: string | null;
  onRestore?: (id: string, name: string) => void;
}) {
  if (items.length === 0) {
    return (
      <MobileNoResults
        title={archivedMode ? "No archived employees" : "No matching employees"}
        hint={archivedMode ? "Archived employees will appear here" : "Try a different search or filter"}
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>{archivedMode ? `Archived (${items.length})` : `Results (${items.length})`}</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {items.map((e) => (
          <EmployeeRow key={e.id} e={e} archivedMode={archivedMode} restoring={restoring === e.id} onRestore={onRestore} />
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
function GroupedList({ items, pendingCount }: { items: EmployeeListItem[]; pendingCount: number }) {
  const trades = [...new Set(items.map((e) => e.trade).filter(Boolean))] as string[];
  const ungrouped = items.filter((e) => !e.trade);

  return (
    <div>
      <MobileSectionTitle
        right={
          pendingCount > 0 ? (
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
          ) : null
        }
      >
        By Trade
      </MobileSectionTitle>
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
function EmployeeRow({
  e,
  archivedMode,
  restoring,
  onRestore,
}: {
  e: EmployeeListItem;
  archivedMode?: boolean;
  restoring?: boolean;
  onRestore?: (id: string, name: string) => void;
}) {
  // Wage amounts are null for viewers without payroll.manage|hr.manage —
  // show no wage line rather than "—/day".
  const wage =
    e.dailyRate == null && e.monthlySalary == null
      ? null
      : e.wageType === "DAILY"
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
        style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
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
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <MobileRow
          href={archivedMode ? undefined : `/m/hr/employees/${e.id}`}
          icon={Users}
          title={e.name}
          empId={e.id}
          subtitle={subtitleParts.join(" · ") || "—"}
          meta={wage ?? undefined}
          badge={badge}
        />
      </div>
      {archivedMode && onRestore && (
        <button
          onClick={() => onRestore(e.id, e.name)}
          disabled={restoring}
          className="shrink-0 rounded-[0.375rem] px-2.5 py-1.5 text-m-caption font-bold flex items-center gap-1 press disabled:opacity-50"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}
        >
          <RotateCcw className="size-3" />
          {restoring ? "…" : "Restore"}
        </button>
      )}
    </div>
  );
}
