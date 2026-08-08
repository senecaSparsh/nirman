"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Calendar, Printer, ExternalLink, Undo2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum, THNum } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export type PurchaseRegisterRow = {
  srNo: number;
  id: string;
  type: "PURCHASE" | "RETURN";
  number: string;
  date: string;
  name: string;
  round: number;
  billAmt: number;
};

export type PurchaseRegisterReportData = {
  from: string;
  to: string;
  rows: PurchaseRegisterRow[];
  count: number;
  purchaseCount: number;
  returnCount: number;
  totalPurchases: number;
  totalReturns: number;
  netTotal: number;
};

export function PurchaseRegisterReport({ report }: { report: PurchaseRegisterReportData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? report.from);
  const [to, setTo] = useState(searchParams.get("to") ?? report.to);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/reports/purchase-register?${params.toString()}`);
  }

  function exportCSV() {
    const rows: Record<string, unknown>[] = report.rows.map((r) => ({
      srNo: r.srNo,
      type: r.type,
      number: r.number,
      date: r.date,
      name: r.name,
      round: r.round,
      billAmt: r.billAmt,
    }));
    rows.push(
      { srNo: "", type: "", number: "", date: "", name: "TOTAL PURCHASES", round: "", billAmt: report.totalPurchases },
      { srNo: "", type: "", number: "", date: "", name: "TOTAL RETURNS", round: "", billAmt: report.totalReturns },
      { srNo: "", type: "", number: "", date: "", name: "NET TOTAL", round: "", billAmt: report.netTotal },
    );
    downloadCSV(`purchase-register-${report.from}_to_${report.to}.csv`, rows, [
      { key: "srNo", label: "Sr No" },
      { key: "type", label: "Type" },
      { key: "number", label: "Number" },
      { key: "date", label: "Date" },
      { key: "name", label: "Name" },
      { key: "round", label: "Round", format: (v) => (v === "" ? "" : formatCurrency(Number(v))) },
      { key: "billAmt", label: "Bill Amt", format: (v) => formatCurrency(Number(v)) },
    ]);
  }

  return (
    <div className="space-y-4">
      {/* Date range filter */}
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
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={report.rows.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <a
            href={`/api/export?type=purchase-register&format=xlsx&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={report.rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={report.rows.length === 0}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </form>

      {report.rows.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="No purchases in this period"
          description="Record direct purchases or supplier returns to see them listed here."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <THNum className="w-12">Sr No</THNum>
                <TH className="w-20">Type</TH>
                <TH className="w-32">Number</TH>
                <TH className="w-28">Date</TH>
                <TH>Name</TH>
                <THNum className="w-28">Round</THNum>
                <THNum className="w-36">Bill Amt</THNum>
                <TH className="w-16 print:hidden">Doc</TH>
              </TR>
            </THead>
            <TBody>
              {report.rows.map((r) => (
                <TR key={`${r.type}-${r.id}`}>
                  <TDNum className="text-muted-foreground">{r.srNo}</TDNum>
                  <TD>
                    {r.type === "PURCHASE" ? (
                      <Badge variant="muted" className="gap-1">
                        <ShoppingCart className="h-3 w-3" /> Buy
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1 text-destructive">
                        <Undo2 className="h-3 w-3" /> Ret
                      </Badge>
                    )}
                  </TD>
                  <TD className="font-mono text-micro">{r.number}</TD>
                  <TD className="text-muted-foreground">{formatDate(r.date)}</TD>
                  <TD>{r.name}</TD>
                  <TDNum className="tnum">{r.round !== 0 ? formatCurrency(r.round) : "—"}</TDNum>
                  <TDNum className={`font-semibold tnum ${r.billAmt < 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(r.billAmt)}
                  </TDNum>
                  <TD className="print:hidden">
                    {r.type === "PURCHASE" ? (
                      <Link
                        href={`/print/direct-purchase/${r.id}`}
                        target="_blank"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        title="Print purchase voucher"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/supplier-returns`}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        title="View return"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t-2 border-border bg-subtle">
                <td colSpan={6} className="px-3 py-2.5 text-right text-body font-semibold">
                  Total Purchases ({report.purchaseCount})
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.totalPurchases)}
                </td>
                <td className="print:hidden" />
              </tr>
              <tr className="bg-subtle">
                <td colSpan={6} className="px-3 py-2.5 text-right text-body font-semibold">
                  Total Returns ({report.returnCount})
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum text-destructive">
                  {formatCurrency(report.totalReturns)}
                </td>
                <td className="print:hidden" />
              </tr>
              <tr className="border-t border-border bg-subtle">
                <td colSpan={6} className="px-3 py-2.5 text-right text-body font-bold">
                  Net Total
                </td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">
                  {formatCurrency(report.netTotal)}
                </td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </Table>
        </div>
      )}
    </div>
  );
}
