"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { PieSeries, BarSeries } from "./charts";

export type LocationRow = { id: string; name: string; type: string; value: number; qty: number };
export type CategoryRow = { id: string; name: string; value: number; qty: number };
export type MaterialRow = {
  code: string;
  name: string;
  unit: string;
  categoryName: string;
  value: number;
  qty: number;
};

export function InventoryValueReport({
  locations,
  categories,
  topMaterials,
  grandTotal,
  totalQty,
  asOnDate,
}: {
  locations: LocationRow[];
  categories: CategoryRow[];
  topMaterials: MaterialRow[];
  grandTotal: number;
  totalQty: number;
  asOnDate?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [asOn, setAsOn] = useState(searchParams.get("asOn") ?? asOnDate ?? "");
  const hasData = locations.length > 0;

  function applyAsOn(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (asOn) params.set("asOn", asOn);
    router.push(`/reports/inventory-value?${params.toString()}`);
  }

  function clearAsOn() {
    setAsOn("");
    router.push("/reports/inventory-value");
  }

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = locations.map((l) => ({
      location: l.name,
      type: l.type,
      value: l.value,
      qty: l.qty,
    }));
    downloadCSV("inventory-value-by-location.csv", rows, [
      { key: "location", label: "Location" },
      { key: "type", label: "Type" },
      { key: "value", label: "Value", format: (v) => formatCurrency(Number(v)) },
      { key: "qty", label: "Qty", format: (v) => formatNumber(Number(v), 3) },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No stock on hand"
        description="Receive materials via procurement to see inventory value here."
      />
    );
  }

  const locationChartData = locations.slice(0, 10).map((l) => ({ label: l.name, value: l.value }));
  const categoryChartData = categories.map((c) => ({ label: c.name, value: c.value }));

  return (
    <div className="space-y-5">
      {/* As-on-date filter */}
      <form
        onSubmit={applyAsOn}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      >
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">As on date (optional)</label>
          <Input
            type="date"
            value={asOn}
            onChange={(e) => setAsOn(e.target.value)}
            className="w-auto"
            placeholder="Leave empty for live balance"
          />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="h-4 w-4" /> Apply
        </Button>
        {asOnDate && (
          <Button type="button" variant="ghost" size="sm" onClick={clearAsOn}>
            Clear (live)
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!hasData}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadExcel("inventory-value", { asOn: asOn || undefined })} disabled={!hasData}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        </div>
      </form>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Value by Location</h3>
            <span className="text-caption text-muted-foreground tnum">{formatCurrency(grandTotal)} total</span>
          </div>
          <BarSeries data={locationChartData} name="Value" color="var(--color-stage-build)" horizontal />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Value by Category</h3>
            <span className="text-caption text-muted-foreground tnum">{categories.length} categories</span>
          </div>
          <PieSeries data={categoryChartData} />
        </div>
      </div>

      {/* Location table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">By Location</h3>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Location</TH>
              <TH>Type</TH>
              <TH className="text-right">Qty (mixed)</TH>
              <TH className="text-right">Value</TH>
              <TH className="text-right">Share</TH>
            </TR>
          </THead>
          <TBody>
            {locations.map((l) => {
              const pct = grandTotal > 0 ? (l.value / grandTotal) * 100 : 0;
              return (
                <TR key={l.id}>
                  <TD className="font-medium">{l.name}</TD>
                  <TD className="text-muted-foreground text-micro">{l.type.replace(/_/g, " ").toLowerCase()}</TD>
                  <TD className="text-right tnum">{formatNumber(l.qty, 3)}</TD>
                  <TD className="text-right tnum font-semibold">{formatCurrency(l.value)}</TD>
                  <TD className="text-right tnum text-muted-foreground">{pct.toFixed(1)}%</TD>
                </TR>
              );
            })}
            <TR>
              <TD className="font-bold">Total</TD>
              <TD />
              <TD className="text-right tnum font-bold">{formatNumber(totalQty, 3)}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(grandTotal)}</TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      </div>

      {/* Top materials */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Top Materials by Value</h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Material</TH>
              <TH>Category</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Value</TH>
            </TR>
          </THead>
          <TBody>
            {topMaterials.map((m) => (
              <TR key={m.code}>
                <TD className="font-mono text-micro text-muted-foreground">{m.code}</TD>
                <TD>{m.name}</TD>
                <TD className="text-muted-foreground">{m.categoryName}</TD>
                <TD className="text-right tnum">{formatNumber(m.qty, 3)} {m.unit}</TD>
                <TD className="text-right tnum font-semibold">{formatCurrency(m.value)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
