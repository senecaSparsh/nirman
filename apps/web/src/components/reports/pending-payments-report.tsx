"use client";

import { Download, AlertCircle, ArrowDownRight, ArrowUpRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export type OverduePORow = {
  id: string;
  poNumber: string;
  supplier: string;
  expectedDate: string | null;
  orderedValue: number;
  receivedValue: number;
  payable: number;
  status: string;
  daysOverdue: number;
};
export type ReceivableRow = {
  id: string;
  saleNumber: string;
  customer: string;
  project: string;
  saleDate: string;
  salePrice: number;
  collected: number;
  outstanding: number;
  paymentStatus: string;
  daysSinceSale: number;
};
export type DraftPORow = {
  id: string;
  poNumber: string;
  supplier: string;
  value: number;
  createdAt: string;
};

export function PendingPaymentsReport({
  overduePOs,
  receivables,
  draftPOs,
  totalPayable,
  totalReceivable,
  totalDraft,
}: {
  overduePOs: OverduePORow[];
  receivables: ReceivableRow[];
  draftPOs: DraftPORow[];
  totalPayable: number;
  totalReceivable: number;
  totalDraft: number;
}) {
  const hasData = overduePOs.length > 0 || receivables.length > 0 || draftPOs.length > 0;

  const exportPayables = () => {
    const rows: Record<string, unknown>[] = overduePOs.map((p) => ({
      po: p.poNumber,
      supplier: p.supplier,
      expected: p.expectedDate ? formatDate(p.expectedDate) : "",
      payable: p.payable,
      daysOverdue: p.daysOverdue,
      status: p.status,
    }));
    downloadCSV("overdue-payables.csv", rows, [
      { key: "po", label: "PO" },
      { key: "supplier", label: "Supplier" },
      { key: "expected", label: "Expected" },
      { key: "payable", label: "Payable", format: (v) => formatCurrency(Number(v)) },
      { key: "daysOverdue", label: "Days Overdue" },
      { key: "status", label: "Status" },
    ]);
  };

  const exportReceivables = () => {
    const rows: Record<string, unknown>[] = receivables.map((r) => ({
      sale: r.saleNumber,
      customer: r.customer,
      project: r.project,
      saleDate: formatDate(r.saleDate),
      salePrice: r.salePrice,
      collected: r.collected,
      outstanding: r.outstanding,
      daysSinceSale: r.daysSinceSale,
      status: r.paymentStatus,
    }));
    downloadCSV("outstanding-receivables.csv", rows, [
      { key: "sale", label: "Sale" },
      { key: "customer", label: "Customer" },
      { key: "project", label: "Project" },
      { key: "saleDate", label: "Sale Date" },
      { key: "salePrice", label: "Sale Price", format: (v) => formatCurrency(Number(v)) },
      { key: "collected", label: "Collected", format: (v) => formatCurrency(Number(v)) },
      { key: "outstanding", label: "Outstanding", format: (v) => formatCurrency(Number(v)) },
      { key: "daysSinceSale", label: "Days Since Sale" },
      { key: "status", label: "Status" },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-5 w-5" />}
        title="No pending payments"
        description="All POs are on time and all sales are fully collected."
      />
    );
  }

  const netCash = totalReceivable - totalPayable;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><ArrowDownRight className="h-3 w-3" /> Payable</div>
          <div className="tnum text-body font-bold text-danger">{formatCurrency(totalPayable)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><ArrowUpRight className="h-3 w-3" /> Receivable</div>
          <div className="tnum text-body font-bold text-success">{formatCurrency(totalReceivable)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Net cash position</div>
          <div className={`tnum text-body font-bold ${netCash >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(netCash)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><Clock className="h-3 w-3" /> Draft POs</div>
          <div className="tnum text-body font-bold">{formatCurrency(totalDraft)}</div>
        </div>
      </div>

      {/* Overdue POs (payables) */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Overdue Purchase Orders (Payables)</h3>
          <Button variant="outline" size="sm" onClick={exportPayables} disabled={overduePOs.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
        {overduePOs.length === 0 ? (
          <div className="px-4 py-6 text-center text-meta text-muted-foreground">No overdue POs.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Supplier</TH>
                <TH>Expected</TH>
                <TH className="text-right">Received Value</TH>
                <TH className="text-right">Payable</TH>
                <TH className="text-right">Overdue</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {overduePOs.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-micro">{p.poNumber}</TD>
                  <TD className="font-medium">{p.supplier}</TD>
                  <TD className="text-muted-foreground">{p.expectedDate ? formatDate(p.expectedDate) : "—"}</TD>
                  <TD className="text-right tnum">{formatCurrency(p.receivedValue)}</TD>
                  <TD className="text-right tnum font-semibold text-danger">{formatCurrency(p.payable)}</TD>
                  <TD className="text-right tnum text-warning">{p.daysOverdue}d</TD>
                  <TD><StatusPill status={p.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {/* Outstanding receivables */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Outstanding Sale Receivables</h3>
          <Button variant="outline" size="sm" onClick={exportReceivables} disabled={receivables.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
        {receivables.length === 0 ? (
          <div className="px-4 py-6 text-center text-meta text-muted-foreground">All sales fully collected.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Sale</TH>
                <TH>Customer</TH>
                <TH>Project</TH>
                <TH className="text-right">Sale Price</TH>
                <TH className="text-right">Collected</TH>
                <TH className="text-right">Outstanding</TH>
                <TH className="text-right">Ageing</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {receivables.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-micro">{r.saleNumber}</TD>
                  <TD className="font-medium">{r.customer}</TD>
                  <TD className="text-muted-foreground">{r.project}</TD>
                  <TD className="text-right tnum">{formatCurrency(r.salePrice)}</TD>
                  <TD className="text-right tnum text-success">{formatCurrency(r.collected)}</TD>
                  <TD className="text-right tnum font-semibold text-warning">{formatCurrency(r.outstanding)}</TD>
                  <TD className="text-right tnum text-muted-foreground">{r.daysSinceSale}d</TD>
                  <TD><StatusPill status={r.paymentStatus} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {/* Draft POs awaiting approval */}
      {draftPOs.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-body font-semibold">Draft POs Awaiting Approval</h3>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Supplier</TH>
                <TH>Created</TH>
                <TH className="text-right">Value</TH>
              </TR>
            </THead>
            <TBody>
              {draftPOs.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-micro">{p.poNumber}</TD>
                  <TD className="font-medium">{p.supplier}</TD>
                  <TD className="text-muted-foreground">{formatDate(p.createdAt)}</TD>
                  <TD className="text-right tnum font-semibold">{formatCurrency(p.value)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
