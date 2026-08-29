"use client";

import { useState, useMemo } from "react";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
  MobileFab,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileNewProjectDialog } from "./MobileNewProjectDialog";

type ProjectStatusFilter =
  | "ALL"
  | "PLANNED"
  | "ACTIVE"
  | "COMPLETED"
  | "ON_HOLD";

export type ProjectListItem = {
  id: string;
  name: string;
  status: string;
  type: string;
  totalBudget: number | null;
  reraNumber: string | null;
  unitCount: number;
};

const FILTER_CHIPS: { label: string; value: ProjectStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Planned", value: "PLANNED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "On Hold", value: "ON_HOLD" },
];

/**
 * Client component for the mobile project list. Handles client-side
 * search (project name) + status filter chips. When no filter/search
 * is active, projects are shown grouped by status section (Active &
 * Planned → Completed → On Hold), matching the original layout. When
 * a filter or search is active, a flat result list is shown instead.
 *
 * Reskinned to use v2 warm primitives.
 */
export function MobileProjectsList({
  items,
  canManage = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ProjectListItem[];
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("ALL");
  const [showNewProject, setShowNewProject] = useState(false);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, query, statusFilter]);

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  return (
    <div>
      {/* ── New project FAB (managers only) ─────────────────── */}
      {canManage && (
        <MobileFab onClick={() => setShowNewProject(true)} label="New project" />
      )}
      {showNewProject && (
        <MobileNewProjectDialog
          open={showNewProject}
          onClose={() => setShowNewProject(false)}
        />
      )}

      {/* ── No projects: show empty state (button already rendered above) ── */}
      {items.length === 0 ? (
        <MobileEmptyState
          icon={Building2}
          title="No projects yet"
          hint={canManage ? "Tap the + button to create one" : "Ask an admin to create a project"}
        />
      ) : (
        <>
          {/* ── Search + filter + export ─────────────────────── */}
          <MobileSearchHeader
            query={query}
            onQueryChange={setQuery}
            placeholder="Search by project name…"
            action={
              <div className="flex items-center gap-1 shrink-0">
                <MobileFilterIcon
                  options={FILTER_CHIPS}
                  active={statusFilter}
                  defaultValue="ALL"
                  onChange={(v) => setStatusFilter(v as ProjectStatusFilter)}
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
            showClear={query !== "" || statusFilter !== "ALL"}
            onClear={() => {
              setQuery("");
              setStatusFilter("ALL");
            }}
          />

          {isFiltering ? (
            <FlatList items={filtered} />
          ) : (
            <GroupedList items={items} canManage={canManage} />
          )}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({ items }: { items: ProjectListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileNoResults
        title="No matching projects"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {items.map((p) => (
          <MobileRow
            key={p.id}
            href={`/m/projects/${p.id}`}
            icon={Building2}
            title={p.name}
            subtitle={`${p.unitCount} units · ${p.type.replace(/_/g, " ").toLowerCase()}`}
            meta={p.totalBudget != null ? formatCurrencyCompact(p.totalBudget) : undefined}
            badge={
              <div className="flex items-center gap-1">
                {p.reraNumber ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-m-caption font-bold"
                    style={{ color: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}>
                    <ShieldCheck className="size-2" /> RERA
                  </span>
                ) : null}
                <MobileStatusBadge status={p.status} />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items, canManage = false }: { items: ProjectListItem[]; canManage?: boolean }) {
  const active = items.filter(
    (p) => p.status === "PLANNED" || p.status === "ACTIVE",
  );
  const done = items.filter((p) => p.status === "COMPLETED");
  const hold = items.filter((p) => p.status === "ON_HOLD");

  return (
    <div>
      <MobileSectionTitle>Active &amp; Planned</MobileSectionTitle>
      {active.length === 0 ? (
        <MobileEmptyState
          icon={Building2}
          title="No active projects"
          hint={canManage ? "Tap the + button to create one" : "Ask an admin to create a project"}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {active.map((p) => (
            <MobileRow
              key={p.id}
              href={`/m/projects/${p.id}`}
              icon={Building2}
              title={p.name}
              subtitle={`${p.unitCount} units · ${p.type.replace(/_/g, " ").toLowerCase()}`}
              meta={p.totalBudget != null ? formatCurrencyCompact(p.totalBudget) : undefined}
              badge={<ReraBadge reraNumber={p.reraNumber} status={p.status} />}
            />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <MobileSectionTitle>Completed</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {done.map((p) => (
              <MobileRow
                key={p.id}
                href={`/m/projects/${p.id}`}
                icon={Building2}
                title={p.name}
                subtitle={`${p.unitCount} units`}
                meta={p.totalBudget != null ? formatCurrencyCompact(p.totalBudget) : undefined}
                badge={<ReraBadge reraNumber={p.reraNumber} status={p.status} />}
              />
            ))}
          </div>
        </>
      )}

      {hold.length > 0 && (
        <>
          <MobileSectionTitle>On Hold</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {hold.map((p) => (
              <MobileRow
                key={p.id}
                href={`/m/projects/${p.id}`}
                icon={Building2}
                title={p.name}
                subtitle={`${p.unitCount} units`}
                meta={p.totalBudget != null ? formatCurrencyCompact(p.totalBudget) : undefined}
                badge={<ReraBadge reraNumber={p.reraNumber} status={p.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * RERA + status badge combo
 * ---------------------------------------------------------------- */
function ReraBadge({ reraNumber, status }: { reraNumber: string | null; status: string }) {
  return (
    <div className="flex items-center gap-1">
      {reraNumber ? (
        <span
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-m-caption font-bold"
          style={{ color: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <ShieldCheck className="size-2" /> RERA
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-m-caption font-bold"
          style={{ color: "var(--color-signal-dark)", backgroundColor: "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}
        >
          <ShieldCheck className="size-2" /> No RERA
        </span>
      )}
      <MobileStatusBadge status={status} />
    </div>
  );
}
