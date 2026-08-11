"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, LayoutGrid, MapPin, Plus, Rows3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell, ProgressCell } from "@/components/ui/cells";
import { EmptyState } from "@/components/empty-state";
import { StatusPill, statusColor } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ProjectFormDialog } from "./project-form-dialog";

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

export function ProjectsView({
  projects,
  typeLabels,
  permissions,
}: {
  projects: ProjectHealth[];
  typeLabels: Record<string, string>;
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canApprove?: boolean };
}) {
  const [createOpen, setCreateOpen] = useState(false);
  /**
   * Table is the default. Cards are the exception, kept for the one case
   * they're genuinely better — walking a client or an investor through a
   * small portfolio, where the health bars do the talking.
   */
  const [view, setView] = useState<"table" | "cards">("table");
  const router = useRouter();

  const viewToggle = (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: "table", label: "Table", icon: <Rows3 /> },
        { value: "cards", label: "Cards", icon: <LayoutGrid /> },
      ]}
    />
  );

  return (
    <>
      {projects.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No projects yet"
          description="A project is the container for everything else — materials issued, land bought, units built and sold. Create one to start tracking."
          action={permissions?.canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New project</Button> : undefined}
          contactHint="Ask an admin to create the first project."
        />
      ) : view === "cards" ? (
        <>
          {/* Cards view toolbar — view toggle + New button */}
          <div className="flex flex-wrap items-center gap-2">
            {viewToggle}
            {permissions?.canCreate && (
              <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> New Project
              </Button>
            )}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {projects.map((p) => (
              <ProjectHealthCard key={p.id} project={p} typeLabel={typeLabels[p.type] ?? p.type} />
            ))}
          </div>
        </>
      ) : (
        /*
         * The portfolio is a comparison, not a set of profiles. Twenty
         * project cards is twenty screens of scrolling with no way to
         * answer "which one is bleeding?" — the whole reason an owner
         * opens this page. As rows, margin and burn are columns you can
         * sort, and the answer is the first row.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={projects}
                storageKey="projects"
                searchable
                searchPlaceholder="Search projects…"
                hideable
                exportFileName="projects"
                className="[&>div:nth-child(2)]:overflow-x-hidden"
                initialSort={{ key: "pnl.profit", direction: "desc" }}
                onRowClick={(p) => router.push(`/projects/${p.id}`)}
                showTotals
                sumColumns={["totalBudget", "spent", "revenue", "pnl.profit"]}
                totalFormat={(_k, sum) => formatCurrency(sum)}
                rowTone={(p) =>
                  p.totalBudget > 0 && (p.pnl.totalCost || p.totalProjectCost) > p.totalBudget
                    ? "danger"
                    : null
                }
                toolbarLeading={viewToggle}
                toolbarTrailing={
                  permissions?.canCreate ? (
                    <Button size="sm" className="h-7 gap-1.5" onClick={() => setCreateOpen(true)}>
                      <Plus className="size-3.5" /> New Project
                    </Button>
                  ) : undefined
                }
                columns={[
                  {
                    key: "name",
                    label: "Project",
                    sortable: true,
                    width: "1fr",
                    render: (p) => (
                      <IdentityCell
                        name={p.name}
                        sub={p.address ?? typeLabels[p.type] ?? p.type}
                        dot={statusColor(p.status)}
                      />
                    ),
                  },
                  {
                    key: "type",
                    label: "Type",
                    sortable: true,
                    render: (p) => <Badge variant="outline">{typeLabels[p.type] ?? p.type}</Badge>,
                    exportValue: (p) => typeLabels[p.type] ?? p.type,
                  },
                  {
                    key: "status",
                    label: "Status",
                    sortable: true,
                    render: (p) => <StatusPill status={p.status} />,
                  },
                  {
                    key: "burn",
                    label: "Budget burn",
                    sortable: true,
                    hint: "Actual cost as a share of the approved budget. Red past 100%.",
                    sortValue: (p) =>
                      p.totalBudget > 0 ? (p.pnl.totalCost || p.totalProjectCost) / p.totalBudget : -1,
                    render: (p) => (
                      <ProgressCell
                        value={p.pnl.totalCost || p.totalProjectCost}
                        total={p.totalBudget}
                        label={formatCurrency(p.totalBudget)}
                      />
                    ),
                    exportValue: (p) =>
                      p.totalBudget > 0
                        ? `${(((p.pnl.totalCost || p.totalProjectCost) / p.totalBudget) * 100).toFixed(0)}%`
                        : "",
                  },
                  {
                    key: "sold",
                    label: "Units sold",
                    sortable: true,
                    hint: "Sold units as a share of all built units in the project.",
                    sortValue: (p) => (p.unitCount > 0 ? p.soldUnits / p.unitCount : -1),
                    render: (p) => (
                      <ProgressCell
                        value={p.soldUnits}
                        total={p.unitCount}
                        invert
                        label={`${p.soldUnits}/${p.unitCount}`}
                      />
                    ),
                    exportValue: (p) => `${p.soldUnits}/${p.unitCount}`,
                  },
                  {
                    key: "timeline",
                    label: "Timeline",
                    sortable: true,
                    defaultHidden: true,
                    sortValue: (p) => timelinePct(p.startDate, p.endDate),
                    render: (p) =>
                      p.startDate && p.endDate ? (
                        <ProgressCell
                          value={timelinePct(p.startDate, p.endDate)}
                          total={100}
                          label={formatDate(p.endDate)}
                          warnAt={101}
                          dangerAt={102}
                        />
                      ) : (
                        <span className="text-faint">—</span>
                      ),
                  },
                  {
                    key: "totalBudget",
                    label: "Budget",
                    align: "right",
                    sortable: true,
                    render: (p) => (p.totalBudget ? formatCurrency(p.totalBudget) : <span className="text-faint">—</span>),
                    exportValue: (p) => p.totalBudget,
                  },
                  {
                    key: "spent",
                    label: "Spent",
                    align: "right",
                    sortable: true,
                    sortValue: (p) => p.pnl.totalCost || p.totalProjectCost,
                    render: (p) => formatCurrency(p.pnl.totalCost || p.totalProjectCost),
                    exportValue: (p) => p.pnl.totalCost || p.totalProjectCost,
                  },
                  {
                    key: "revenue",
                    label: "Revenue",
                    align: "right",
                    sortable: true,
                    sortValue: (p) => p.pnl.revenue,
                    render: (p) => (p.pnl.revenue ? formatCurrency(p.pnl.revenue) : <span className="text-faint">—</span>),
                    exportValue: (p) => p.pnl.revenue,
                  },
                  {
                    key: "pnl.profit",
                    label: "Profit",
                    align: "right",
                    sortable: true,
                    bar: true,
                    hint: "Revenue booked less total cost. Margin shown beneath.",
                    sortValue: (p) => p.pnl.profit,
                    render: (p) => (
                      <MoneyCell
                        value={p.pnl.profit}
                        formatted={formatCurrency(p.pnl.profit)}
                        showSign
                        sub={p.pnl.revenue > 0 ? `${p.pnl.margin.toFixed(1)}% margin` : undefined}
                      />
                    ),
                    exportValue: (p) => p.pnl.profit,
                  },
                ]}
              />
            </div>
      )}
      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

/** Elapsed share of a project's planned duration, clamped to 0–100. */
function timelinePct(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return -1;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (end <= start) return -1;
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

function ProjectHealthCard({ project, typeLabel }: { project: ProjectHealth; typeLabel: string }) {
  const statusDot = statusColor(project.status);
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
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusDot }} />
            <h3 className="text-body font-semibold text-foreground">{project.name}</h3>
            <Badge variant="outline">{typeLabel}</Badge>
            <StatusPill status={project.status} />
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
