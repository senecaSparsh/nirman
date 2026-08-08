"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar, Printer, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TDNum, THNum } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export type LocationMovementRow = {
  id: string;
  name: string;
  type: string;
  opening: number;
  received: number;
  issued: number;
  balance: number;
};

export type CategoryMovementRow = {
  name: string;
  received: number;
  issued: number;
};

export type StockMovementSummaryData = {
  from: string;
  to: string;
  opening: number;
  received: number;
  issued: number;
  balance: number;
  balanceQty: number;
  liveBalance: number;
  locationRows: LocationMovementRow[];
  categoryRows: CategoryMovementRow[];
};

export function StockMovementSummaryReport({ report }: { report: StockMovementSummaryData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? report.from);
  const [to, setTo] = useState(searchParams.get("to") ?? report.to);
  const [view, setView] = useState<"summary" | "location" | "category">("summary");

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/reports/stock-movement-summary?${params.toString()}`);
  }

  function exportCSV() {
    if (view === "summary") {
      const rows = [
        { label: "Opening Stock", value: report.opening },
        { label: "Received (in period)", value: report.received },
        { label: "Issued (in period)", value: report.issued },
        { label: "Closing Balance", value: report.balance },
        { label: "Closing Qty (units)", value: report.balanceQty },
      ];
      downloadCSV(`stock-movement-summary-${report.from}_to_${report.to}.csv`, rows, [
        { key: "label", label: "Metric" },
        { key: "value", label: "Amount", format: (v) => formatCurrency(Number(v)) },
      ]);
    } else if (view === "location") {
      const rows: Record<string, unknown>[] = report.locationRows.map((r) => ({
        location: r.name,
        type: r.type,
        opening: r.opening,
        received: r.received,
        issued: r.issued,
        balance: r.balance,
      }));
      downloadCSV(`stock-movement-by-location-${report.from}_to_${report.to}.csv`, rows, [
        { key: "location", label: "Location" },
        { key: "type", label: "Type" },
        { key: "opening", label: "Opening", format: (v) => formatCurrency(Number(v)) },
        { key: "received", label: "Received", format: (v) => formatCurrency(Number(v)) },
        { key: "issued", label: "Issued", format: (v) => formatCurrency(Number(v)) },
        { key: "balance", label: "Balance", format: (v) => formatCurrency(Number(v)) },
      ]);
    } else {
      const rows: Record<string, unknown>[] = report.categoryRows.map((r) => ({
        category: r.name,
        received: r.received,
        issued: r.issued,
        net: r.received - r.issued,
      }));
      downloadCSV(`stock-movement-by-category-${report.from}_to_${report.to}.csv`, rows, [
        { key: "category", label: "Category" },
        { key: "received", label: "Received", format: (v) => formatCurrency(Number(v)) },
        { key: "issued", label: "Issued", format: (v) => formatCurrency(Number(v)) },
        { key: "net", label: "Net", format: (v) => formatCurrency(Number(v)) },
      ]);
    }
  }

  const hasData = report.received !== 0 || report.issued !== 0 || report.balance !== 0;

  return (
    <div className="space-y-4">
      {/* Date range filter + view toggle */}
      <form
        onSubmit={applyRange}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      >
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
        <div className="flex gap-1">
          {(["summary", "location", "category"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              variant={view === v ? "default" : "outline"}
              size="sm"
              onClick={() => setView(v)}
              className="capitalize"
            >
              {v}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCSV} disabled={!hasData}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <a
            href={`/api/export?type=stock-movement-summary&format=xlsx&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
          >
            <Button type="button" variant="outline" size="sm" disabled={!hasData}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!hasData}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </form>

      {!hasData ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="No stock movements in this period"
          description="Receive or issue materials to see the stock flow here."
        />
      ) : view === "summary" ? (
        <>
          {/* Four-metric band — the instrument panel */}
          <div className="grid grid-cols-2 divide-x divide-y-0 divide-border rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
            <div className="p-4">
              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Opening
              </div>
              <div className="mt-1.5 text-h3 font-bold tnum text-foreground">
                {formatCurrency(report.opening)}
              </div>
              <div className="mt-0.5 text-micro text-muted-foreground">Stock value at start</div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Received
              </div>
              <div className="mt-1.5 text-h3 font-bold tnum text-foreground">
                {formatCurrency(report.received)}
              </div>
              <div className="mt-0.5 text-micro text-muted-foreground">Purchases + adjustments in</div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Issued
              </div>
              <div className="mt-1.5 text-h3 font-bold tnum text-foreground">
                {formatCurrency(report.issued)}
              </div>
              <div className="mt-0.5 text-micro text-muted-foreground">Issues + sales + returns</div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Balance
              </div>
              <div className="mt-1.5 text-h3 font-bold tnum text-foreground">
                {formatCurrency(report.balance)}
              </div>
              <div className="mt-0.5 text-micro text-muted-foreground">
                Opn + Rec − Issue
              </div>
            </div>
          </div>

          {/* Identity verification */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">
              Identity check: Opening + Received − Issued = Balance
            </span>
            <span className="font-mono tnum text-foreground">
              {formatCurrency(report.opening)} + {formatCurrency(report.received)} −{" "}
              {formatCurrency(report.issued)} = {formatCurrency(report.balance)}
            </span>
          </div>

          {/* Closing stock detail */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-body font-semibold text-foreground">Closing Stock Detail</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-caption text-muted-foreground">Balance Value (computed)</div>
                <div className="text-body font-bold tnum text-foreground">{formatCurrency(report.balance)}</div>
              </div>
              <div>
                <div className="text-caption text-muted-foreground">Balance Value (live ledger)</div>
                <div className="text-body font-bold tnum text-foreground">{formatCurrency(report.liveBalance)}</div>
              </div>
              <div>
                <div className="text-caption text-muted-foreground">Balance Quantity</div>
                <div className="text-body font-bold tnum text-foreground">
                  {report.balanceQty.toLocaleString("en-IN")} units
                </div>
              </div>
            </div>
            {Math.abs(report.balance - report.liveBalance) > 1 && (
              <div className="mt-2 text-caption text-amber-600">
                Note: Computed balance differs from live ledger by{" "}
                {formatCurrency(Math.abs(report.balance - report.liveBalance))}. This can happen when
                stock counts or direct adjustments were recorded outside the movement ledger.
              </div>
            )}
          </div>
        </>
      ) : view === "location" ? (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Location</TH>
                <TH className="w-24">Type</TH>
                <THNum>Opening</THNum>
                <THNum>Received</THNum>
                <THNum>Issued</THNum>
                <THNum>Balance</THNum>
              </TR>
            </THead>
            <TBody>
              {report.locationRows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-micro text-muted-foreground">{r.type.replace(/_/g, " ")}</TD>
                  <TDNum className="tnum">{formatCurrency(r.opening)}</TDNum>
                  <TDNum className="tnum text-foreground">{formatCurrency(r.received)}</TDNum>
                  <TDNum className="tnum text-muted-foreground">{formatCurrency(r.issued)}</TDNum>
                  <TDNum className="font-semibold tnum">{formatCurrency(r.balance)}</TDNum>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t-2 border-border bg-subtle">
                <td colSpan={2} className="px-3 py-2.5 text-right text-body font-bold">
                  Total
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.opening)}
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.received)}
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.issued)}
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.balance)}
                </td>
              </tr>
            </tfoot>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <THNum>Received</THNum>
                <THNum>Issued</THNum>
                <THNum>Net</THNum>
              </TR>
            </THead>
            <TBody>
              {report.categoryRows.map((r) => (
                <TR key={r.name}>
                  <TD className="font-medium">{r.name}</TD>
                  <TDNum className="tnum text-foreground">{formatCurrency(r.received)}</TDNum>
                  <TDNum className="tnum text-muted-foreground">{formatCurrency(r.issued)}</TDNum>
                  <TDNum className={`font-semibold tnum ${r.received - r.issued < 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(r.received - r.issued)}
                  </TDNum>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t-2 border-border bg-subtle">
                <td className="px-3 py-2.5 text-right text-body font-bold">Total</td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.received)}
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.issued)}
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.received - report.issued)}
                </td>
              </tr>
            </tfoot>
          </Table>
        </div>
      )}
    </div>
  );
}
