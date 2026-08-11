"use client";

import { useState, useMemo } from "react";
import { TrendingUp, Users, Clock, DollarSign, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber, formatDate, cn } from "@/lib/utils";

export type ProjectAnalysis = {
  id: string;
  name: string;
  status: string;
  dprCount: number;
  latestProgressPct: number;
  progressDelta: number;
  totalLaborHours: number;
  workforcePresent: number;
  workforceAbsent: number;
  workforceLeave: number;
  attendanceRate: number;
  totalHours: number;
  projectCost: number;
  labourCost: number;
  revenue: number;
  profit: number;
  margin: number;
  history: { date: string; progressPct: number; laborHours: number; workSummary: string }[];
};

export function ComparativeReportView({ projects }: { projects: ProjectAnalysis[] }) {
  const [detailTarget, setDetailTarget] = useState<ProjectAnalysis | null>(null);

  const totals = useMemo(() => {
    return {
      projects: projects.length,
      avgProgress: projects.length > 0 ? projects.reduce((s, p) => s + p.latestProgressPct, 0) / projects.length : 0,
      totalLaborHours: projects.reduce((s, p) => s + p.totalLaborHours, 0),
      totalCost: projects.reduce((s, p) => s + p.projectCost, 0),
      totalLabourCost: projects.reduce((s, p) => s + p.labourCost, 0),
      totalRevenue: projects.reduce((s, p) => s + p.revenue, 0),
      avgAttendance: projects.length > 0 ? projects.reduce((s, p) => s + p.attendanceRate, 0) / projects.length : 0,
    };
  }, [projects]);

  const historyColumns: Column<ProjectAnalysis["history"][number]>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (h) => h.date,
      render: (h) => <span className="text-muted-foreground">{formatDate(h.date)}</span>,
      exportValue: (h) => formatDate(h.date),
    },
    {
      key: "progressPct",
      label: "Progress %",
      align: "right",
      sortable: true,
      sortValue: (h) => h.progressPct,
      render: (h) => <span className="font-medium">{h.progressPct.toFixed(1)}%</span>,
      exportValue: (h) => h.progressPct.toFixed(1) + "%",
    },
    {
      key: "laborHours",
      label: "Labor Hours",
      align: "right",
      sortable: true,
      sortValue: (h) => h.laborHours,
      render: (h) => <span className="tnum">{h.laborHours.toFixed(1)}</span>,
      exportValue: (h) => h.laborHours.toFixed(1),
    },
    {
      key: "workSummary",
      label: "Work Summary",
      sortable: true,
      render: (h) => <span className="text-muted-foreground max-w-xs truncate block">{h.workSummary}</span>,
      sortValue: (h) => h.workSummary,
      exportValue: (h) => h.workSummary,
    },
  ];

  const projectColumns: Column<ProjectAnalysis>[] = [
    {
      key: "name",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{p.name}</span>
          <StatusPill status={p.status} />
        </div>
      ),
      filterValue: (p) => p.name,
      exportValue: (p) => p.name,
    },
    {
      key: "latestProgressPct",
      label: "Progress",
      align: "right",
      sortable: true,
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Badge variant={p.progressDelta >= 0 ? "success" : "danger"}>
            {p.progressDelta >= 0 ? "+" : ""}{p.progressDelta.toFixed(1)}%
          </Badge>
          <span className="tnum font-medium">{p.latestProgressPct.toFixed(1)}%</span>
        </div>
      ),
      exportValue: (p) => p.latestProgressPct.toFixed(1) + "%",
    },
    {
      key: "attendanceRate",
      label: "Attendance",
      align: "right",
      sortable: true,
      render: (p) => (
        <span className={cn(
          "tnum",
          p.attendanceRate >= 80 ? "text-success" : p.attendanceRate >= 60 ? "text-warning" : "text-danger",
        )}>
          {p.attendanceRate.toFixed(0)}%
        </span>
      ),
      exportValue: (p) => p.attendanceRate.toFixed(0) + "%",
    },
    {
      key: "totalLaborHours",
      label: "Labor Hrs",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum text-muted-foreground">{formatNumber(p.totalLaborHours, 0)}</span>,
      exportValue: (p) => p.totalLaborHours.toFixed(0),
    },
    {
      key: "projectCost",
      label: "Cost",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum text-warning">{formatCurrency(p.projectCost)}</span>,
      exportValue: (p) => p.projectCost,
    },
    {
      key: "revenue",
      label: "Revenue",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum text-success">{formatCurrency(p.revenue)}</span>,
      exportValue: (p) => p.revenue,
    },
    {
      key: "margin",
      label: "Margin",
      align: "right",
      sortable: true,
      render: (p) => (
        <span className={cn("tnum font-medium", p.margin >= 0 ? "text-success" : "text-danger")}>
          {p.margin.toFixed(1)}%
        </span>
      ),
      exportValue: (p) => p.margin.toFixed(1) + "%",
    },
  ];

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No matches"
      description="Adjust the search or column filters."
    />
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> Avg Progress
          </div>
          <div className="text-h2 font-bold text-foreground">{totals.avgProgress.toFixed(1)}%</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Clock className="h-3 w-3" /> Labour Hours
          </div>
          <div className="text-h2 font-bold text-foreground">{formatNumber(totals.totalLaborHours, 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Users className="h-3 w-3" /> Avg Attendance
          </div>
          <div className="text-h2 font-bold text-foreground">{totals.avgAttendance.toFixed(0)}%</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Total Cost
          </div>
          <div className="text-h2 font-bold text-foreground">{formatCurrency(totals.totalCost)}</div>
        </div>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title="No projects to compare"
          description="Create projects with DPRs and costs to see comparative analysis."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={projects}
            columns={projectColumns}
            storageKey="comparative-analysis"
            hideable
            exportFileName="comparative-analysis"
            initialSort={{ key: "latestProgressPct", direction: "desc" }}
            onRowClick={(p) => setDetailTarget(p)}
            searchable
            searchPlaceholder="Search project, status…"
            rowTone={(p) => (p.margin < 0 ? "danger" : null)}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <ProjectDetailDialog project={detailTarget} historyColumns={historyColumns} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Project Detail Dialog
// ───────────────────────────────────────────────────────────

function ProjectDetailDialog({
  project,
  historyColumns,
  onClose,
}: {
  project: ProjectAnalysis;
  historyColumns: Column<ProjectAnalysis["history"][number]>[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={project.name}
      description={`${project.dprCount} DPRs · ${project.totalLaborHours.toFixed(0)} labor hrs · ${project.attendanceRate.toFixed(0)}% attendance`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Status + progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusPill status={project.status} />
            <Badge variant={project.progressDelta >= 0 ? "success" : "danger"}>
              {project.progressDelta >= 0 ? "+" : ""}{project.progressDelta.toFixed(1)}%
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-body font-medium text-foreground">{project.latestProgressPct.toFixed(1)}%</div>
            <div className="text-caption text-muted-foreground">progress</div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Project Cost</div>
            <div className="text-foreground font-medium">{formatCurrency(project.projectCost)}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Labour Cost</div>
            <div className="text-foreground font-medium">{formatCurrency(project.labourCost)}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Revenue</div>
            <div className="text-foreground font-medium">{formatCurrency(project.revenue)}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Margin</div>
            <div className={cn("font-medium", project.margin >= 0 ? "text-success" : "text-danger")}>{project.margin.toFixed(1)}%</div>
          </div>
        </div>

        {/* Workforce */}
        <div className="grid grid-cols-3 gap-3 text-meta">
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Present (30d)</div>
            <div className="text-success font-medium">{project.workforcePresent}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Absent (30d)</div>
            <div className="text-danger font-medium">{project.workforceAbsent}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="text-muted-foreground">Leave (30d)</div>
            <div className="text-muted-foreground font-medium">{project.workforceLeave}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex justify-between text-caption text-muted-foreground">
            <span>Progress</span>
            <span>{project.latestProgressPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                project.latestProgressPct >= 75 ? "bg-success" : project.latestProgressPct >= 40 ? "bg-warning" : "bg-danger",
              )}
              style={{ width: `${Math.min(project.latestProgressPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Progress history */}
        {project.history.length > 0 && (
          <div>
            <div className="mb-2 text-body font-medium text-foreground">Progress Over Time</div>
            <div className="overflow-hidden rounded-md border border-border">
              <DataTable
                columns={historyColumns}
                data={project.history.slice(-10).reverse()}
                storageKey="comparative-project-history"
                exportFileName={`project-history-${project.id}`}
                searchable={false}
                pageSize={10}
              />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
