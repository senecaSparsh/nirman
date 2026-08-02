"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Building2, MapPin, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ProjectsToolbar } from "./projects-toolbar";

type ProjectHealth = {
  id: string;
  name: string;
  type: string;
  status: string;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number;
  totalProjectCost: number;
  phaseCount: number;
  unitCount: number;
  soldUnits: number;
  availableUnits: number;
  locationCount: number;
  pnl: { totalCost: number; revenue: number; profit: number; margin: number };
};

const STATUS_COLOR: Record<string, string> = {
  PLANNED: "var(--color-muted-foreground)",
  ACTIVE: "var(--color-stage-sell)",
  COMPLETED: "var(--color-stage-manage)",
  ON_HOLD: "var(--color-warning)",
};

export function ProjectsView({
  projects,
  typeLabels,
  permissions,
}: {
  projects: ProjectHealth[];
  typeLabels: Record<string, string>;
  statusVariant?: Record<string, "default" | "success" | "warning" | "muted" | "danger">;
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canApprove?: boolean };
}) {
  const [filters, setFilters] = useState({ search: "", status: "", type: "" });

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.address ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filters.status && p.status !== filters.status) return false;
      if (filters.type && p.type !== filters.type) return false;
      return true;
    });
  }, [projects, filters]);

  return (
    <>
      <ProjectsToolbar filters={filters} onFilterChange={setFilters} canCreate={permissions?.canCreate ?? true} />

      {projects.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No projects yet"
          description="Create your first project to start tracking materials, land and built units."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No projects match the filters"
          description="Try adjusting your search or filters."
        />
      ) : (
        /* ── Project health cards ──────────────────────────────────────
           Each project is a wide, rich card showing its vital signs:
           - Budget burn (actual cost vs budget) as a visual bar
           - Unit sales progress (sold vs total) as a visual bar
           - Profit/Loss as a big number (green/red)
           - Timeline progress (start → now → end) as a visual bar

           This is NOT a table. You see the HEALTH of each project
           at a glance — is it on budget? selling? profitable? on time?
           Complex data (P&L, budget burn, sales velocity) made simple. */
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProjectHealthCard key={p.id} project={p} typeLabel={typeLabels[p.type] ?? p.type} />
          ))}
        </div>
      )}
    </>
  );
}

function ProjectHealthCard({ project, typeLabel }: { project: ProjectHealth; typeLabel: string }) {
  const statusColor = STATUS_COLOR[project.status] ?? "var(--color-muted-foreground)";
  const budget = project.totalBudget;
  const actualCost = project.pnl.totalCost || project.totalProjectCost;
  const budgetBurnPct = budget > 0 ? Math.min(100, (actualCost / budget) * 100) : 0;
  const isOverBudget = budget > 0 && actualCost > budget;

  const salesPct = project.unitCount > 0 ? (project.soldUnits / project.unitCount) * 100 : 0;

  const profit = project.pnl.profit;
  const margin = project.pnl.margin;
  const isProfitable = profit >= 0;

  // Timeline progress
  const now = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  let timelinePct = 0;
  if (start && end) {
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    timelinePct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  }

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Row 1: Identity */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
            <h3 className="text-body font-semibold text-foreground">{project.name}</h3>
            <Badge variant="outline">{typeLabel}</Badge>
            <Badge variant={project.status === "ACTIVE" ? "success" : project.status === "ON_HOLD" ? "warning" : "muted"}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          {project.address && (
            <div className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {project.address}
            </div>
          )}
        </div>

        {/* Profit — the big number */}
        <div className="shrink-0 text-right">
          <div className="text-label text-muted-foreground/70">Profit</div>
          <div className={`text-title tnum ${isProfitable ? "text-success" : "text-danger"}`}>
            {isProfitable ? "+" : ""}{formatCurrency(profit)}
          </div>
          {project.pnl.revenue > 0 && (
            <div className={`text-caption tnum ${isProfitable ? "text-success" : "text-danger"}`}>
              {margin.toFixed(1)}% margin
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Health bars */}
      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        {/* Budget burn */}
        {budget > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Budget Burn</span>
              <span className={`text-caption tnum ${isOverBudget ? "text-danger font-semibold" : "text-muted-foreground"}`}>
                {budgetBurnPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${isOverBudget ? "bg-danger" : budgetBurnPct > 80 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(100, budgetBurnPct)}%` }}
              />
            </div>
            <div className="mt-0.5 text-micro text-muted-foreground tnum">
              {formatCurrency(actualCost)} / {formatCurrency(budget)}
            </div>
          </div>
        )}

        {/* Unit sales */}
        {project.unitCount > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Units Sold</span>
              <span className="text-caption tnum text-muted-foreground">
                {salesPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground"
                style={{ width: `${salesPct}%` }}
              />
            </div>
            <div className="mt-0.5 text-micro text-muted-foreground tnum">
              {project.soldUnits} sold · {project.availableUnits} available · {project.unitCount} total
            </div>
          </div>
        )}

        {/* Timeline */}
        {start && end && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Timeline</span>
              <span className="text-caption tnum text-muted-foreground">
                {timelinePct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${timelinePct >= 100 ? "bg-muted-foreground" : "bg-foreground"}`}
                style={{ width: `${timelinePct}%` }}
              />
            </div>
            <div className="mt-0.5 text-micro text-muted-foreground tnum">
              {formatDate(project.startDate)} → {formatDate(project.endDate)}
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Quick stats footer */}
      <div className="mt-3 flex items-center gap-4 border-t border-border/60 pt-2 text-caption text-muted-foreground">
        {project.phaseCount > 0 && <span>{project.phaseCount} phases</span>}
        {project.unitCount > 0 && <span>{project.unitCount} units</span>}
        {project.locationCount > 0 && <span>{project.locationCount} locations</span>}
        {project.pnl.revenue > 0 && (
          <span className="tnum">Revenue: {formatCurrency(project.pnl.revenue)}</span>
        )}
        <span className="ml-auto text-muted-foreground/40 transition-colors group-hover:text-foreground">
          Open →
        </span>
      </div>
    </Link>
  );
}
