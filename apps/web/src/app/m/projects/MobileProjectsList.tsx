"use client";

import { useState, useMemo } from "react";
import { Building2, Search, X, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
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
}: {
  items: ProjectListItem[];
  canManage?: boolean;
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

  if (items.length === 0) return null;

  return (
    <div>
      {/* ── New project button (managers only) ─────────────────── */}
      {canManage && (
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press mb-3"
          style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
        >
          <Plus className="size-3.5" />
          New Project
        </button>
      )}
      {showNewProject && (
        <MobileNewProjectDialog
          open={showNewProject}
          onClose={() => setShowNewProject(false)}
        />
      )}

      {/* ── Warm search bar ───────────────────────────────────── */}
      <div className="mb-4">
        <div
          className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        >
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by project name…"
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="press">
              <X className="size-4" style={{ color: "var(--color-ink-300)" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter chips (warm style) ─────────────────────────── */}
      <div className="flex gap-1.5 mb-4">
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold transition-colors"
              style={{
                backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)",
                color: active ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {isFiltering ? (
        <FlatList items={filtered} />
      ) : (
        <GroupedList items={items} canManage={canManage} />
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
      <MobileEmptyState
        icon={Building2}
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
            meta={p.totalBudget != null ? formatCurrency(p.totalBudget) : undefined}
            badge={<MobileStatusBadge status={p.status} />}
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
          hint={canManage ? "Tap “New Project” above to create one" : "Ask an admin to create a project"}
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
              meta={p.totalBudget != null ? formatCurrency(p.totalBudget) : undefined}
              badge={<MobileStatusBadge status={p.status} />}
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
                meta={p.totalBudget != null ? formatCurrency(p.totalBudget) : undefined}
                badge={<MobileStatusBadge status={p.status} />}
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
                meta={p.totalBudget != null ? formatCurrency(p.totalBudget) : undefined}
                badge={<MobileStatusBadge status={p.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
