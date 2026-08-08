"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
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

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = monthly.map((m) => ({
      month: m.label,
      inputGst: m.inputGst,
      outputGst: m.outputGst,
      netGst: m.netGst,
    }));
    downloadCSV(`gst-summary-${from}_to_${to}.csv`, rows, [
      { key: "month", label: "Month" },
      { key: "inputGst", label: "Input GST (ITC)", format: (v) => formatCurrency(Number(v)) },
      { key: "outputGst", label: "Output GST", format: (v) => formatCurrency(Number(v)) },
      { key: "netGst", label: "Net GST", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

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
            onClick={exportCSV}
            disabled={!hasData}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
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
          icon={<Download className="h-5 w-5" />}
          title="No GST activity in this period"
          description="Post purchase receipts or asset sales with GST to see your GST position here."
        />
      ) : (
        <>
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
        <div className="flex items-center justify-between">
          <h3 className="text-body font-semibold text-foreground">Monthly GST Summary</h3>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH className="text-right">Input GST (ITC)</TH>
                <TH className="text-right">Output GST</TH>
                <TH className="text-right">Net GST</TH>
              </TR>
            </THead>
            <TBody>
              {monthly.map((m) => (
                <TR key={m.label}>
                  <TD className="font-medium">{m.label}</TD>
                  <TD className="text-right">{formatCurrency(m.inputGst)}</TD>
                  <TD className="text-right">{formatCurrency(m.outputGst)}</TD>
                  <TD className="text-right font-medium">
                    <span className={m.netGst >= 0 ? "text-danger" : "text-success"}>
                      {formatCurrency(m.netGst)}
                    </span>
                  </TD>
                </TR>
              ))}
              <TR className="border-t-2 border-border bg-muted/30 font-semibold">
                <TD>Total</TD>
                <TD className="text-right">{formatCurrency(totalInput)}</TD>
                <TD className="text-right">{formatCurrency(totalOutput)}</TD>
                <TD className="text-right">
                  <span className={netPayable >= 0 ? "text-danger" : "text-success"}>
                    {formatCurrency(netPayable)}
                  </span>
                </TD>
              </TR>
            </TBody>
          </Table>
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

      {/* Output GST transactions (sales) */}
      {saleRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-body font-semibold text-foreground">Output GST Transactions (Sales)</h3>
          <p className="text-meta text-muted-foreground">{saleRows.length} sales with GST in the period</p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Sale #</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH className="text-right">Taxable Value</TH>
                  <TH className="text-right">GST</TH>
                </TR>
              </THead>
              <TBody>
                {saleRows.slice(0, 20).map((s) => (
                  <TR key={s.number}>
                    <TD className="font-medium">{s.number}</TD>
                    <TD>{formatDate(s.date)}</TD>
                    <TD>{s.party}</TD>
                    <TD className="text-right">{formatCurrency(s.taxableValue)}</TD>
                    <TD className="text-right font-medium">{formatCurrency(s.gst)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      {/* Input GST transactions (purchases) */}
      {poRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-body font-semibold text-foreground">Input GST Transactions (Purchases)</h3>
          <p className="text-meta text-muted-foreground">{poRows.length} purchase orders with GST in the period</p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>PO #</TH>
                  <TH>Date</TH>
                  <TH>Supplier</TH>
                  <TH className="text-right">Taxable Value</TH>
                  <TH className="text-right">GST</TH>
                </TR>
              </THead>
              <TBody>
                {poRows.slice(0, 20).map((p) => (
                  <TR key={p.number}>
                    <TD className="font-medium">{p.number}</TD>
                    <TD>{formatDate(p.date)}</TD>
                    <TD>{p.party}</TD>
                    <TD className="text-right">{formatCurrency(p.taxableValue)}</TD>
                    <TD className="text-right font-medium">{formatCurrency(p.gst)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
