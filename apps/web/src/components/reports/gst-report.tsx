"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Printer, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { BarSeries, AreaSeries } from "./charts";

export type MonthlyGstRow = { label: string; inputGst: number; outputGst: number; netGst: number };
export type TransactionRow = {
  number: string;
  date: string;
  party: string;
  taxableValue: number;
  gst: number;
  status: string;
};

export function GstReport({
  from,
  to,
  monthly,
  totalInput,
  totalOutput,
  netPayable,
  poRows,
  saleRows,
}: {
  from: string;
  to: string;
  monthly: MonthlyGstRow[];
  totalInput: number;
  totalOutput: number;
  netPayable: number;
  poRows: TransactionRow[];
  saleRows: TransactionRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fromState, setFrom] = useState(searchParams.get("from") ?? from);
  const [toState, setTo] = useState(searchParams.get("to") ?? to);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromState) params.set("from", fromState);
    if (toState) params.set("to", toState);
    router.push(`/reports/gst?${params.toString()}`);
  }

  const hasData = monthly.some((m) => m.inputGst > 0 || m.outputGst > 0);

  const monthlyColumns: Column<MonthlyGstRow>[] = [
    {
      key: "label",
      label: "Month",
      sortable: true,
      render: (m) => <span className="font-medium text-foreground">{m.label}</span>,
      exportValue: (m) => m.label,
    },
    {
      key: "inputGst",
      label: "Input GST (ITC)",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.inputGst)}</span>,
      exportValue: (m) => m.inputGst,
    },
    {
      key: "outputGst",
      label: "Output GST",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.outputGst)}</span>,
      exportValue: (m) => m.outputGst,
    },
    {
      key: "netGst",
      label: "Net GST",
      align: "right",
      sortable: true,
      render: (m) => (
        <span className={cn("tnum font-medium", m.netGst >= 0 ? "text-danger" : "text-success")}>
          {formatCurrency(m.netGst)}
        </span>
      ),
      exportValue: (m) => m.netGst,
    },
  ];

  const saleColumns: Column<TransactionRow>[] = [
    {
      key: "number",
      label: "Sale #",
      sortable: true,
      render: (s) => <span className="font-medium text-foreground">{s.number}</span>,
      exportValue: (s) => s.number,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (s) => new Date(s.date).getTime(),
      render: (s) => <span className="text-muted-foreground">{formatDate(s.date)}</span>,
      exportValue: (s) => formatDate(s.date),
    },
    {
      key: "party",
      label: "Customer",
      sortable: true,
      filterable: true,
      render: (s) => <span className="text-foreground">{s.party}</span>,
      filterValue: (s) => s.party,
      exportValue: (s) => s.party,
    },
    {
      key: "taxableValue",
      label: "Taxable Value",
      align: "right",
      sortable: true,
      render: (s) => <span className="tnum">{formatCurrency(s.taxableValue)}</span>,
      exportValue: (s) => s.taxableValue,
    },
    {
      key: "gst",
      label: "GST",
      align: "right",
      sortable: true,
      render: (s) => <span className="tnum font-medium">{formatCurrency(s.gst)}</span>,
      exportValue: (s) => s.gst,
    },
  ];

  const poColumns: Column<TransactionRow>[] = [
    {
      key: "number",
      label: "PO #",
      sortable: true,
      render: (p) => <span className="font-medium text-foreground">{p.number}</span>,
      exportValue: (p) => p.number,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (p) => new Date(p.date).getTime(),
      render: (p) => <span className="text-muted-foreground">{formatDate(p.date)}</span>,
      exportValue: (p) => formatDate(p.date),
    },
    {
      key: "party",
      label: "Supplier",
      sortable: true,
      filterable: true,
      render: (p) => <span className="text-foreground">{p.party}</span>,
      filterValue: (p) => p.party,
      exportValue: (p) => p.party,
    },
    {
      key: "taxableValue",
      label: "Taxable Value",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum">{formatCurrency(p.taxableValue)}</span>,
      exportValue: (p) => p.taxableValue,
    },
    {
      key: "gst",
      label: "GST",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum font-medium">{formatCurrency(p.gst)}</span>,
      exportValue: (p) => p.gst,
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
    <div className="space-y-5">
      {/* Date range filter */}
      <form
        onSubmit={applyRange}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      >
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">From</label>
          <Input type="date" value={fromState} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </div>
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">To</label>
          <Input type="date" value={toState} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="h-4 w-4" /> Apply
        </Button>
        <div className="ml-auto flex gap-2">
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
          title="No GST activity in this period"
          description="Post purchase receipts or asset sales with GST to see your GST position here."
        />
      ) : (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="output" count={saleRows.length}>Output (Sales)</TabsTrigger>
            <TabsTrigger value="input" count={poRows.length}>Input (Purchases)</TabsTrigger>
          </TabsList>

          {/* ── Summary: charts + monthly table ────────────────────── */}
          <TabsContent value="summary">
            <div className="space-y-4">
              {/* Net GST trend */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-body font-semibold text-foreground">Net GST Position</h3>
                <p className="text-meta text-muted-foreground">Output GST − Input GST (positive = payable to government)</p>
                <div className="mt-3">
                  <AreaSeries data={monthly.map((m) => ({ label: m.label, value: m.netGst }))} name="Net GST" color="var(--color-stage-account)" height={260} />
                </div>
              </div>

              {/* Input vs Output */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-body font-semibold text-foreground">Input GST (ITC) vs Output GST</h3>
                <p className="text-meta text-muted-foreground">Monthly comparison</p>
                <div className="mt-3">
                  <BarSeries data={monthly.map((m) => ({ label: m.label, value: m.outputGst }))} name="Output GST" color="var(--color-danger)" height={260} />
                </div>
              </div>

              {/* Summary table */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-body font-semibold text-foreground">Monthly GST Summary</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <DataTable
                    data={monthly}
                    columns={monthlyColumns}
                    storageKey="gst-monthly"
                    hideable
                    exportFileName="gst-summary"
                    initialSort={{ key: "label", direction: "asc" }}
                    searchable
                    searchPlaceholder="Search month…"
                    showTotals
                    sumColumns={["inputGst", "outputGst", "netGst"]}
                    totalFormat={(key, sum) => {
                      if (key === "netGst") return formatCurrency(netPayable);
                      return formatCurrency(sum);
                    }}
                    emptyState={noMatch}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {netPayable > 0 ? (
                    <Badge variant="warning">GST Payable: {formatCurrency(netPayable)}</Badge>
                  ) : netPayable < 0 ? (
                    <Badge variant="success">ITC Credit Carry-Forward: {formatCurrency(-netPayable)}</Badge>
                  ) : (
                    <Badge variant="muted">No net GST liability</Badge>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Output GST (sales) ─────────────────────────────────── */}
          <TabsContent value="output">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-1 text-body font-semibold text-foreground">Output GST Transactions (Sales)</h3>
                <p className="mb-3 text-meta text-muted-foreground">{saleRows.length} sales with GST in the period</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <DataTable
                    data={saleRows}
                    columns={saleColumns}
                    storageKey="gst-sales"
                    hideable
                    exportFileName="gst-output-transactions"
                    initialSort={{ key: "date", direction: "desc" }}
                    searchable
                    searchPlaceholder="Search sale #, customer…"
                    showTotals
                    sumColumns={["taxableValue", "gst"]}
                    totalFormat={(_k, sum) => formatCurrency(sum)}
                    emptyState={noMatch}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Input GST (purchases) ──────────────────────────────── */}
          <TabsContent value="input">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-1 text-body font-semibold text-foreground">Input GST Transactions (Purchases)</h3>
                <p className="mb-3 text-meta text-muted-foreground">{poRows.length} purchase orders with GST in the period</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <DataTable
                    data={poRows}
                    columns={poColumns}
                    storageKey="gst-purchases"
                    hideable
                    exportFileName="gst-input-transactions"
                    initialSort={{ key: "date", direction: "desc" }}
                    searchable
                    searchPlaceholder="Search PO #, supplier…"
                    showTotals
                    sumColumns={["taxableValue", "gst"]}
                    totalFormat={(_k, sum) => formatCurrency(sum)}
                    emptyState={noMatch}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
