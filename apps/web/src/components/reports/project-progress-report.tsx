"use client";

import { Fragment, useState } from "react";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { BarSeries } from "./charts";

export type ProjectRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number;
  totalCost: number;
  materials: number;
  labour: number;
  land: number;
  revenue: number;
  profit: number;
  margin: number;
  progressPct: number;
  lastDprDate: string | null;
  unitCount: number;
  phaseCount: number;
  phases: { name: string; status: string }[];
};

export function ProjectProgressReport({
  rows,
  totalCost,
  totalRevenue,
  totalProfit,
}: {
  rows: ProjectRow[];
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const exportCSV = () => {
    const out: Record<string, unknown>[] = rows.map((r) => ({
      project: r.name,
      type: r.type,
      status: r.status,
      budget: r.budget,
      materials: r.materials,
      labour: r.labour,
      land: r.land,
      totalCost: r.totalCost,
      revenue: r.revenue,
      profit: r.profit,
      margin: r.margin.toFixed(1),
      progressPct: r.progressPct,
      units: r.unitCount,
    }));
    downloadCSV("project-progress.csv", out, [
      { key: "project", label: "Project" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "budget", label: "Budget", format: (v) => formatCurrency(Number(v)) },
      { key: "materials", label: "Materials", format: (v) => formatCurrency(Number(v)) },
      { key: "labour", label: "Labour", format: (v) => formatCurrency(Number(v)) },
      { key: "land", label: "Land", format: (v) => formatCurrency(Number(v)) },
      { key: "totalCost", label: "Total Cost", format: (v) => formatCurrency(Number(v)) },
      { key: "revenue", label: "Revenue", format: (v) => formatCurrency(Number(v)) },
      { key: "profit", label: "Profit", format: (v) => formatCurrency(Number(v)) },
      { key: "margin", label: "Margin %" },
      { key: "progressPct", label: "Progress %" },
      { key: "units", label: "Units" },
    ]);
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No projects"
        description="Create projects to see progress and P&L here."
      />
    );
  }

  const chartData = rows
    .slice()
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10)
    .map((r) => ({ label: r.name, value: r.totalCost }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-body font-semibold">Cost by Project (top 10)</h3>
          <span className="text-caption text-muted-foreground tnum">{formatCurrency(totalCost)} total</span>
        </div>
        <BarSeries data={chartData} name="Cost" color="var(--color-stage-build)" horizontal />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Project P&L</h3>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Project</TH>
              <TH>Status</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">Profit</TH>
              <TH className="text-right">Margin</TH>
              <TH className="text-right">Progress</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <TR
                  className="cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <TD>
                    <div className="flex items-center gap-1.5">
                      {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </TD>
                  <TD><StatusPill status={r.status} /></TD>
                  <TD className="text-right tnum">{formatCurrency(r.totalCost)}</TD>
                  <TD className="text-right tnum">{formatCurrency(r.revenue)}</TD>
                  <TD className={`text-right tnum font-semibold ${r.profit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(r.profit)}</TD>
                  <TD className="text-right tnum text-muted-foreground">{r.margin.toFixed(1)}%</TD>
                  <TD className="text-right tnum">{r.progressPct.toFixed(1)}%</TD>
                </TR>
                {expanded === r.id && (
                  <TR className="bg-muted/20">
                    <TD colSpan={7} className="p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="mb-2 text-caption font-medium text-muted-foreground">Cost Breakdown</div>
                          <div className="space-y-1 text-meta">
                            <div className="flex justify-between"><span>Materials</span><span className="tnum">{formatCurrency(r.materials)}</span></div>
                            <div className="flex justify-between"><span>Labour / Overhead</span><span className="tnum">{formatCurrency(r.labour)}</span></div>
                            <div className="flex justify-between"><span>Land</span><span className="tnum">{formatCurrency(r.land)}</span></div>
                            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tnum">{formatCurrency(r.totalCost)}</span></div>
                            {r.budget > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Budget utilisation</span>
                                <span className="tnum">{((r.totalCost / r.budget) * 100).toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-caption font-medium text-muted-foreground">Status & Units</div>
                          <div className="space-y-1 text-meta">
                            <div className="flex justify-between"><span>Type</span><span>{r.type}</span></div>
                            <div className="flex justify-between"><span>Units</span><span className="tnum">{formatNumber(r.unitCount, 0)}</span></div>
                            <div className="flex justify-between"><span>Phases</span><span className="tnum">{formatNumber(r.phaseCount, 0)}</span></div>
                            <div className="flex justify-between"><span>Last DPR</span><span>{r.lastDprDate ? formatDate(r.lastDprDate) : "—"}</span></div>
                          </div>
                          {r.phases.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {r.phases.map((ph) => (
                                <span key={ph.name} className="text-micro">
                                  {ph.name}: <StatusPill status={ph.status} className="text-micro" />
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TD>
                  </TR>
                )}
              </Fragment>
            ))}
            <TR>
              <TD className="font-bold">Total</TD>
              <TD />
              <TD className="text-right tnum font-bold">{formatCurrency(totalCost)}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(totalRevenue)}</TD>
              <TD className={`text-right tnum font-bold ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(totalProfit)}</TD>
              <TD />
              <TD />
            </TR>
          </TBody>
        </Table>
      </div>
    </div>
  );
}
