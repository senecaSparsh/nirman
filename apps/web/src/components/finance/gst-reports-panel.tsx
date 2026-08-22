"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export function GstReportsPanel() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<"gstr1" | "gstr3b" | null>(null);
  const [gstr1, setGstr1] = useState<null | {
    totalTaxableValue: number;
    totalOutputGst: number;
    totalIgst: number;
    totalInvoiceCount: number;
    entries: { date: string; sourceType: string; memo: string; taxableValue: number; gstAmount: number; gstRate: number }[];
  }>(null);
  const [gstr3b, setGstr3b] = useState<null | {
    outwardTaxableValue: number;
    outwardOutputGst: number;
    inwardTaxableValue: number;
    inwardInputGst: number;
    itcAvailable: number;
    itcReversed: number;
    netGstPayable: number;
    itcCarriedForward: number;
  }>(null);

  async function fetchReport(type: "gstr1" | "gstr3b") {
    setLoading(type);
    try {
      const res = await fetch(`/api/gst-reports?type=${type}&from=${from}&to=${to}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch report");
      }
      const data = await res.json();
      if (type === "gstr1") {
        setGstr1(data);
      } else {
        setGstr3b(data);
      }
      toast.success(`${type.toUpperCase()} report generated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch report");
    } finally {
      setLoading(null);
    }
  }

  function exportCsv() {
    if (!gstr1 && !gstr3b) return;
    let csv = "";
    if (gstr3b) {
      csv += "GSTR-3B Summary\n";
      csv += `Outward Taxable Value,${gstr3b.outwardTaxableValue}\n`;
      csv += `Output GST,${gstr3b.outwardOutputGst}\n`;
      csv += `Inward Taxable Value,${gstr3b.inwardTaxableValue}\n`;
      csv += `Input GST (ITC),${gstr3b.inwardInputGst}\n`;
      csv += `ITC Reversed,${gstr3b.itcReversed}\n`;
      csv += `Net ITC Available,${gstr3b.itcAvailable}\n`;
      csv += `Net GST Payable,${gstr3b.netGstPayable}\n`;
      csv += `ITC Carried Forward,${gstr3b.itcCarriedForward}\n\n`;
    }
    if (gstr1) {
      csv += "GSTR-1 Line Items\n";
      csv += "Date,Source,Memo,Taxable Value,GST Amount,GST Rate\n";
      for (const e of gstr1.entries) {
        csv += `${new Date(e.date).toLocaleDateString("en-IN")},${e.sourceType},"${e.memo}",${e.taxableValue},${e.gstAmount},${e.gstRate.toFixed(2)}%\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> GST Reconciliation Reports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date range */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchReport("gstr3b")} disabled={loading !== null}>
            {loading === "gstr3b" ? "Loading…" : "GSTR-3B Summary"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchReport("gstr1")} disabled={loading !== null}>
            {loading === "gstr1" ? "Loading…" : "GSTR-1 Details"}
          </Button>
          {(gstr1 || gstr3b) && (
            <Button variant="ghost" size="sm" onClick={exportCsv}>
              <Download className="size-3 mr-1" /> CSV
            </Button>
          )}
        </div>

        {/* GSTR-3B Summary */}
        {gstr3b ? (
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="font-semibold text-sm mb-2">GSTR-3B Summary ({from} to {to})</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Outward Taxable Value:</span><span className="font-mono">{formatCurrency(gstr3b.outwardTaxableValue)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Output GST:</span><span className="font-mono">{formatCurrency(gstr3b.outwardOutputGst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Inward Taxable Value:</span><span className="font-mono">{formatCurrency(gstr3b.inwardTaxableValue)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Input GST (ITC):</span><span className="font-mono">{formatCurrency(gstr3b.inwardInputGst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ITC Reversed:</span><span className="font-mono">{formatCurrency(gstr3b.itcReversed)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Net ITC Available:</span><span className="font-mono">{formatCurrency(gstr3b.itcAvailable)}</span></div>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-bold">
                <span>Net GST Payable:</span>
                <span className="font-mono">{formatCurrency(gstr3b.netGstPayable)}</span>
              </div>
              {gstr3b.itcCarriedForward > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>ITC Carried Forward:</span>
                  <span className="font-mono">{formatCurrency(gstr3b.itcCarriedForward)}</span>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* GSTR-1 Details */}
        {gstr1 ? (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex justify-between items-center">
              <h4 className="font-semibold text-sm">GSTR-1 Outward Supplies ({gstr1.totalInvoiceCount} entries)</h4>
              <div className="text-sm text-muted-foreground">
                Total GST: <span className="font-mono font-semibold">{formatCurrency(gstr1.totalOutputGst)}</span>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Taxable</th>
                    <th className="text-right p-2">GST</th>
                    <th className="text-right p-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {gstr1.entries.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-4 text-muted-foreground">No outward supplies in this period</td></tr>
                  ) : (
                    gstr1.entries.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                        <td className="p-2">{e.sourceType}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(e.taxableValue)}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(e.gstAmount)}</td>
                        <td className="p-2 text-right">{e.gstRate.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
