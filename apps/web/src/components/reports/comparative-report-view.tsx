"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, TrendingUp, Users, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { Select } from "@/components/ui/input";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("progress");

  const sorted = useMemo(() => {
    const arr = [...projects];
    if (sortBy === "progress") arr.sort((a, b) => b.latestProgressPct - a.latestProgressPct);
    else if (sortBy === "productivity") arr.sort((a, b) => b.attendanceRate - a.attendanceRate);
    else if (sortBy === "cost") arr.sort((a, b) => b.projectCost - a.projectCost);
    else if (sortBy === "margin") arr.sort((a, b) => b.margin - a.margin);
    return arr;
  }, [projects, sortBy]);

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
    { key: "date", label: "Date", render: (h) => <span className="text-muted-foreground">{formatDate(h.date)}</span>, sortValue: (h) => h.date },
    { key: "progressPct", label: "Progress %", align: "right", render: (h) => <span className="font-medium">{h.progressPct.toFixed(1)}%</span>, sortValue: (h) => h.progressPct },
    { key: "laborHours", label: "Labor Hours", align: "right", render: (h) => h.laborHours.toFixed(1), sortValue: (h) => h.laborHours },
    { key: "workSummary", label: "Work Summary", render: (h) => <span className="text-muted-foreground max-w-xs truncate block">{h.workSummary}</span>, sortValue: (h) => h.workSummary },
  ];

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

      {/* Sort selector */}
      <div className="flex items-center gap-3">
        <span className="text-meta text-muted-foreground">Sort by:</span>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-auto">
          <option value="progress">Progress %</option>
          <option value="productivity">Attendance Rate</option>
          <option value="cost">Project Cost</option>
          <option value="margin">Profit Margin</option>
        </Select>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {sorted.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card">
            <button
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
            >
              {expanded === p.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div className="flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{p.name}</span>
                  <StatusPill status={p.status} />
                  <Badge variant={p.progressDelta >= 0 ? "success" : "danger"}>
                    {p.progressDelta >= 0 ? "+" : ""}{p.progressDelta.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-meta text-muted-foreground">
                  {p.dprCount} DPRs · {p.totalLaborHours.toFixed(0)} labor hrs · {p.attendanceRate.toFixed(0)}% attendance
                </div>
              </div>
              <div className="text-right">
                <div className="text-body font-medium text-foreground">{p.latestProgressPct.toFixed(1)}%</div>
                <div className="text-caption text-muted-foreground">progress</div>
              </div>
            </button>

            {expanded === p.id && (
              <div className="border-t border-border p-3 space-y-3">
                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
                  <div><div className="text-muted-foreground">Project Cost</div><div className="text-foreground">{formatCurrency(p.projectCost)}</div></div>
                  <div><div className="text-muted-foreground">Labour Cost</div><div className="text-foreground">{formatCurrency(p.labourCost)}</div></div>
                  <div><div className="text-muted-foreground">Revenue</div><div className="text-foreground">{formatCurrency(p.revenue)}</div></div>
                  <div>
                    <div className="text-muted-foreground">Margin</div>
                    <div className={p.margin >= 0 ? "text-success" : "text-danger"}>{p.margin.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Workforce */}
                <div className="grid grid-cols-3 gap-3 text-meta">
                  <div><div className="text-muted-foreground">Present (30d)</div><div className="text-success">{p.workforcePresent}</div></div>
                  <div><div className="text-muted-foreground">Absent (30d)</div><div className="text-danger">{p.workforceAbsent}</div></div>
                  <div><div className="text-muted-foreground">Leave (30d)</div><div className="text-muted-foreground">{p.workforceLeave}</div></div>
                </div>

                {/* Progress history */}
                {p.history.length > 0 && (
                  <div>
                    <div className="mb-2 text-body font-medium text-foreground">Progress Over Time</div>
                    <DataTable
                      columns={historyColumns}
                      data={p.history.slice(-10).reverse()}
                      className="rounded-md border border-border"
                    />
                  </div>
                )}

                {/* Simple progress bar */}
                <div>
                  <div className="mb-1 flex justify-between text-caption text-muted-foreground">
                    <span>Progress</span>
                    <span>{p.latestProgressPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${p.latestProgressPct >= 75 ? "bg-success" : p.latestProgressPct >= 40 ? "bg-warning" : "bg-danger"}`}
                      style={{ width: `${Math.min(p.latestProgressPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
