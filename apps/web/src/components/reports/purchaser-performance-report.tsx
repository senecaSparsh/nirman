"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar, Printer, Trophy, TrendingDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TDNum, THNum } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export type PurchaserPerformanceRowData = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  quotesUploaded: number;
  requisitionsHandled: number;
  cheapestSelected: number;
  totalSpend: number;
  potentialSavings: number;
  avgQuotesPerRequisition: number;
  cheapestSelectionRate: number;
};

export type PurchaserPerformanceReportData = {
  from: string;
  to: string;
  rows: PurchaserPerformanceRowData[];
  count: number;
  totalQuotes: number;
  totalSpend: number;
  totalSavings: number;
};

export function PurchaserPerformanceReport({ report }: { report: PurchaserPerformanceReportData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? report.from);
  const [to, setTo] = useState(searchParams.get("to") ?? report.to);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/reports/purchaser-performance?${params.toString()}`);
  }

  function exportCSV() {
    const rows: Record<string, unknown>[] = report.rows.map((r) => ({
      purchaser: r.userName,
      email: r.userEmail,
      role: r.role,
      quotesUploaded: r.quotesUploaded,
      requisitionsHandled: r.requisitionsHandled,
      avgQuotesPerRequisition: r.avgQuotesPerRequisition.toFixed(2),
      cheapestSelected: r.cheapestSelected,
      cheapestSelectionRate: `${(r.cheapestSelectionRate * 100).toFixed(1)}%`,
      totalSpend: r.totalSpend,
      potentialSavings: r.potentialSavings,
    }));
    downloadCSV(`purchaser-performance-${report.from}_to_${report.to}.csv`, rows, [
      { key: "purchaser", label: "Purchaser" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "quotesUploaded", label: "Quotes Uploaded" },
      { key: "requisitionsHandled", label: "Requisitions Handled" },
      { key: "avgQuotesPerRequisition", label: "Avg Quotes/Req" },
      { key: "cheapestSelected", label: "Cheapest Selected" },
      { key: "cheapestSelectionRate", label: "Cheapest Selection Rate" },
      { key: "totalSpend", label: "Total Spend", format: (v) => formatCurrency(Number(v)) },
      { key: "potentialSavings", label: "Potential Savings", format: (v) => formatCurrency(Number(v)) },
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
          icon={<Users className="h-5 w-5" />}
          title="No quote activity in this period"
          description="Once purchasers start uploading vendor quotes through the comparative quote engine, their performance metrics will appear here."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Purchaser</TH>
                <TH className="w-28">Role</TH>
                <THNum className="w-32">Quotes Uploaded</THNum>
                <THNum className="w-32">Requisitions</THNum>
                <THNum className="w-32">Avg Quotes/Req</THNum>
                <THNum className="w-32">Cheapest Selected</THNum>
                <THNum className="w-32">Selection Rate</THNum>
                <THNum className="w-36">Total Spend</THNum>
                <THNum className="w-36">Potential Savings</THNum>
              </TR>
            </THead>
            <TBody>
              {report.rows.map((r, i) => (
                <TR key={r.userId}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {i === 0 && r.quotesUploaded > 0 && (
                        <Trophy className="h-3.5 w-3.5 text-warning" />
                      )}
                      <div>
                        <div className="font-medium">{r.userName}</div>
                        <div className="text-caption text-muted-foreground">{r.userEmail}</div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-muted-foreground">{r.role}</TD>
                  <TDNum className="tnum font-medium">{r.quotesUploaded}</TDNum>
                  <TDNum className="tnum">{r.requisitionsHandled}</TDNum>
                  <TDNum className="tnum text-muted-foreground">
                    {r.avgQuotesPerRequisition.toFixed(2)}
                  </TDNum>
                  <TDNum className="tnum">
                    {r.cheapestSelected > 0 ? (
                      <span className="font-medium text-success">{r.cheapestSelected}</span>
                    ) : "—"}
                  </TDNum>
                  <TDNum className="tnum">
                    {r.cheapestSelectionRate > 0 ? (
                      <span className={`font-medium ${r.cheapestSelectionRate >= 0.7 ? "text-success" : r.cheapestSelectionRate >= 0.4 ? "text-warning" : "text-muted-foreground"}`}>
                        {(r.cheapestSelectionRate * 100).toFixed(0)}%
                      </span>
                    ) : "—"}
                  </TDNum>
                  <TDNum className="tnum font-medium">{formatCurrency(r.totalSpend)}</TDNum>
                  <TDNum className="tnum">
                    {r.potentialSavings > 0 ? (
                      <span className="flex items-center gap-1 font-medium text-success">
                        <TrendingDown className="h-3 w-3" />
                        {formatCurrency(r.potentialSavings)}
                      </span>
                    ) : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t-2 border-border bg-subtle">
                <td className="px-3 py-2.5 text-body font-semibold">Total ({report.count})</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">{report.totalQuotes}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right text-body font-bold tnum">{formatCurrency(report.totalSpend)}</td>
                <td className="px-3 py-2.5 text-right text-body font-bold tnum text-success">{formatCurrency(report.totalSavings)}</td>
              </tr>
            </tfoot>
          </Table>
        </div>
      )}
    </div>
  );
}
