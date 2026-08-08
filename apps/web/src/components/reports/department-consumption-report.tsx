"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export type ConsumptionReport = {
  from: string;
  to: string;
  departments: {
    code: string;
    name: string;
    total: number;
    materials: {
      code: string;
      name: string;
      unit: string;
      categoryName: string;
      qty: number;
      cost: number;
    }[];
  }[];
  grandTotal: number;
};

export function DepartmentConsumptionReport({ report }: { report: ConsumptionReport }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? report.from);
  const [to, setTo] = useState(searchParams.get("to") ?? report.to);
  const [expanded, setExpanded] = useState<string | null>(report.departments[0]?.code ?? null);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/reports/department-consumption?${params.toString()}`);
  }

  function exportCSV() {
    const rows: Record<string, unknown>[] = [];
    for (const d of report.departments) {
      for (const m of d.materials) {
        rows.push({
          departmentCode: d.code,
          departmentName: d.name,
          materialCode: m.code,
          materialName: m.name,
          category: m.categoryName,
          qty: m.qty,
          unit: m.unit,
          cost: m.cost,
        });
      }
      rows.push({
        departmentCode: d.code,
        departmentName: d.name,
        materialCode: "",
        materialName: `TOTAL ${d.name}`,
        category: "",
        qty: "",
        unit: "",
        cost: d.total,
      });
    }
    rows.push({
      departmentCode: "",
      departmentName: "GRAND TOTAL",
      materialCode: "",
      materialName: "",
      category: "",
      qty: "",
      unit: "",
      cost: report.grandTotal,
    });
    downloadCSV(`cost-center-consumption-${report.from}_to_${report.to}.csv`, rows, [
      { key: "departmentCode", label: "Dept Code" },
      { key: "departmentName", label: "Department" },
      { key: "materialCode", label: "Material Code" },
      { key: "materialName", label: "Material" },
      { key: "category", label: "Category" },
      { key: "qty", label: "Qty" },
      { key: "unit", label: "Unit" },
      { key: "cost", label: "Cost", format: (v) => formatCurrency(Number(v)) },
    ]);
  }

  return (
    <div className="space-y-4">
      {/* Date range filter */}
      <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </div>
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="h-4 w-4" /> Apply
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCSV} disabled={report.departments.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <a
            href={`/api/export?type=stock-issue-summary&format=xlsx&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
          >
            <Button type="button" variant="outline" size="sm" disabled={report.departments.length === 0}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </a>
        </div>
      </form>

      {report.departments.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="No consumption in this period"
          description="Issue materials to cost centers from the Stock Movements or Procurement page to see them here."
        />
      ) : (
        <>
          {/* Department summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {report.departments.map((d) => {
              const pct = report.grandTotal > 0 ? (d.total / report.grandTotal) * 100 : 0;
              return (
                <button
                  key={d.code}
                  onClick={() => setExpanded(expanded === d.code ? null : d.code)}
                  className={`group rounded-lg border bg-card p-3.5 text-left transition-all hover:border-foreground/20 ${
                    expanded === d.code ? "border-foreground/30 ring-1 ring-foreground/10" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-micro text-muted-foreground">{d.code}</div>
                      <div className="truncate text-body font-semibold text-foreground">{d.name}</div>
                    </div>
                    <Badge variant="muted" className="shrink-0">{d.materials.length} items</Badge>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-body font-semibold tnum text-foreground">{formatCurrency(d.total)}</span>
                      <span className="text-caption text-muted-foreground tnum">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Grand total bar */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
            <span className="text-body font-medium text-foreground">Grand Total</span>
            <span className="text-body font-bold tnum text-foreground">{formatCurrency(report.grandTotal)}</span>
          </div>

          {/* Expanded department detail */}
          {expanded && (() => {
            const d = report.departments.find((x) => x.code === expanded);
            if (!d) return null;
            return (
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <span className="font-mono text-micro text-muted-foreground">{d.code}</span>
                    <span className="ml-2 text-body font-semibold text-foreground">{d.name}</span>
                  </div>
                  <span className="text-body font-semibold tnum text-foreground">{formatCurrency(d.total)}</span>
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Code</TH>
                      <TH>Material</TH>
                      <TH>Category</TH>
                      <TH className="text-right">Qty</TH>
                      <TH className="text-right">Cost</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {d.materials
                      .sort((a, b) => b.cost - a.cost)
                      .map((m) => (
                        <TR key={m.code}>
                          <TD className="font-mono text-micro text-muted-foreground">{m.code}</TD>
                          <TD>{m.name}</TD>
                          <TD className="text-muted-foreground">{m.categoryName}</TD>
                          <TD className="text-right tnum">{formatNumber(m.qty, 3)} {m.unit}</TD>
                          <TD className="text-right tnum font-semibold">{formatCurrency(m.cost)}</TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
