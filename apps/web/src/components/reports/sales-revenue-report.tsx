"use client";

import { useState, useMemo } from "react";
import { Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { AreaSeries, BarSeries } from "./charts";

export type SaleRecord = {
  id: string;
  saleNumber: string;
  customer: string;
  projectId: string | null;
  projectName: string;
  unitType: string | null;
  salePrice: number;
  collected: number;
  outstanding: number;
  saleDate: string;
  paymentDates: string[];
};

export type MonthlyRow = { label: string; sales: number; collected: number; count: number };
export type CustomerRow = { name: string; sales: number; collected: number; count: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SalesRevenueReport({
  saleRecords,
  projects,
  unitTypes,
}: {
  saleRecords: SaleRecord[];
  projects: { id: string; name: string }[];
  unitTypes: string[];
}) {
  const [projectFilter, setProjectFilter] = useState("");
  const [unitTypeFilter, setUnitTypeFilter] = useState("");

  const filtered = useMemo(() => {
    return saleRecords.filter((r) => {
      if (projectFilter && r.projectId !== projectFilter) return false;
      if (unitTypeFilter && r.unitType !== unitTypeFilter) return false;
      return true;
    });
  }, [saleRecords, projectFilter, unitTypeFilter]);

  const stats = useMemo(() => {
    const totalSales = filtered.reduce((s, r) => s + r.salePrice, 0);
    const totalCollected = filtered.reduce((s, r) => s + r.collected, 0);
    const totalOutstanding = filtered.reduce((s, r) => s + r.outstanding, 0);
    return { totalSales, totalCollected, totalOutstanding, count: filtered.length };
  }, [filtered]);

  const monthly = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { label: string; sales: number; collected: number; count: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      map.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, sales: 0, collected: 0, count: 0 });
    }
    for (const s of filtered) {
      const d = new Date(s.saleDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const row = map.get(key);
      if (row) {
        row.sales += s.salePrice;
        row.count += 1;
      }
      for (const pd of s.paymentDates) {
        const pdate = new Date(pd);
        const pkey = `${pdate.getFullYear()}-${pdate.getMonth()}`;
        const prow = map.get(pkey);
        if (prow) prow.collected += s.collected / s.paymentDates.length;
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; sales: number; collected: number; count: number }>();
    for (const s of filtered) {
      if (!map.has(s.customer)) map.set(s.customer, { name: s.customer, sales: 0, collected: 0, count: 0 });
      const row = map.get(s.customer)!;
      row.sales += s.salePrice;
      row.collected += s.collected;
      row.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);
  }, [filtered]);

  const hasData = stats.totalSales > 0;
  const hasFilters = projectFilter || unitTypeFilter;

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = topCustomers.map((c) => ({
      customer: c.name,
      deals: c.count,
      sales: c.sales,
      collected: c.collected,
      outstanding: c.sales - c.collected,
    }));
    downloadCSV("sales-revenue-by-customer.csv", rows, [
      { key: "customer", label: "Customer" },
      { key: "deals", label: "Deals" },
      { key: "sales", label: "Sales", format: (v) => formatCurrency(Number(v)) },
      { key: "collected", label: "Collected", format: (v) => formatCurrency(Number(v)) },
      { key: "outstanding", label: "Outstanding", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  if (!hasData && !hasFilters) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No sales in the last 12 months"
        description="Record asset sales from the Sales page to see revenue trends here."
      />
    );
  }

  const chartData = monthly.map((m) => ({ label: m.label, sales: m.sales, collected: m.collected }));
  const customerChartData = topCustomers.slice(0, 8).map((c) => ({ label: c.name, value: c.sales }));
  const collectionPct = stats.totalSales > 0 ? (stats.totalCollected / stats.totalSales) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-body font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <div className="w-48">
          <label className="text-micro text-muted-foreground">Project</label>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-8 w-full text-caption"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <label className="text-micro text-muted-foreground">Unit Type</label>
          <Select
            value={unitTypeFilter}
            onChange={(e) => setUnitTypeFilter(e.target.value)}
            className="h-8 w-full text-caption"
          >
            <option value="">All types</option>
            {unitTypes.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setProjectFilter(""); setUnitTypeFilter(""); }}
          >
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-caption text-muted-foreground">
          {stats.count} sale{stats.count !== 1 ? "s" : ""}
          {hasFilters && ` (filtered from ${saleRecords.length})`}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Total Sales</div>
          <div className="tnum text-body font-bold">{formatCurrency(stats.totalSales)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Collected</div>
          <div className="tnum text-body font-bold text-success">{formatCurrency(stats.totalCollected)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Outstanding</div>
          <div className="tnum text-body font-bold text-warning">{formatCurrency(stats.totalOutstanding)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Collection %</div>
          <div className="tnum text-body font-bold">{collectionPct.toFixed(1)}%</div>
        </div>
      </div>

      {hasData ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-body font-semibold">Sales vs Collections</h3>
                <span className="text-caption text-muted-foreground">last 12 months</span>
              </div>
              <AreaSeries data={chartData} dataKey="sales" name="Sales" color="var(--color-stage-sell)" />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-body font-semibold">Top Customers by Sales</h3>
                <span className="text-caption text-muted-foreground">{topCustomers.length} customers</span>
              </div>
              <BarSeries data={customerChartData} name="Sales" color="var(--color-stage-sell)" horizontal />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-body font-semibold">Customer Breakdown</h3>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH className="text-right">Deals</TH>
                  <TH className="text-right">Sales</TH>
                  <TH className="text-right">Collected</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {topCustomers.map((c) => {
                  const out = c.sales - c.collected;
                  const status = out <= 0 ? "PAID" : c.collected > 0 ? "PARTIAL" : "PENDING";
                  return (
                    <TR key={c.name}>
                      <TD className="font-medium">{c.name}</TD>
                      <TD className="text-right tnum">{formatNumber(c.count, 0)}</TD>
                      <TD className="text-right tnum">{formatCurrency(c.sales)}</TD>
                      <TD className="text-right tnum text-success">{formatCurrency(c.collected)}</TD>
                      <TD className="text-right tnum text-warning">{formatCurrency(out)}</TD>
                      <TD>
                        <StatusPill status={status} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Filter className="h-5 w-5" />}
          title="No sales match these filters"
          description="Try clearing the project or unit type filter to see all sales."
        />
      )}
    </div>
  );
}
