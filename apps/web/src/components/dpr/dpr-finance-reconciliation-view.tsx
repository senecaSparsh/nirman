"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";

type ReconciliationRow = {
  dprId: string;
  projectName: string;
  date: string;
  workSummary: string;
  approvalStatus: string;
  dprMaterialCost: number;
  dprLaborCost: number;
  dprTotalCost: number;
  postedMaterialIssueCost: number;
  postedProjectCost: number;
  postedTotal: number;
  variance: number;
  isPosted: boolean;
  costPostedDate: string | null;
};

export function DprFinanceReconciliationView() {
  const [data, setData] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchReconciliation();
  }, []);

  async function fetchReconciliation() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/dprs/finance-reconciliation?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }

  async function markPosted(dprId: string) {
    try {
      const res = await fetch(`/api/dprs/${dprId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markCostPosted" }),
      });
      if (!res.ok) throw new Error("Failed to mark as posted");
      toast.success("DPR marked as cost-posted");
      fetchReconciliation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const totals = data.reduce(
    (acc, r) => {
      acc.dprTotal += r.dprTotalCost;
      acc.postedTotal += r.postedTotal;
      acc.variance += r.variance;
      acc.unposted += r.isPosted ? 0 : 1;
      return acc;
    },
    { dprTotal: 0, postedTotal: 0, variance: 0, unposted: 0 },
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-2 sm:grid-cols-4">
        <Card className="p-3 space-y-0.5">
          <span className="text-caption text-muted-foreground">DPR Total Costs</span>
          <div className="text-body font-semibold tnum">{formatCurrency(totals.dprTotal)}</div>
        </Card>
        <Card className="p-3 space-y-0.5">
          <span className="text-caption text-muted-foreground">GL Posted</span>
          <div className="text-body font-semibold tnum text-success">{formatCurrency(totals.postedTotal)}</div>
        </Card>
        <Card className={cn("p-3 space-y-0.5", totals.variance > 0 ? "border-warning/30" : "border-success/30")}>
          <span className="text-caption text-muted-foreground">Variance</span>
          <div className={cn("text-body font-semibold tnum", totals.variance > 0 ? "text-warning" : "text-success")}>
            {formatCurrency(totals.variance)}
          </div>
        </Card>
        <Card className={cn("p-3 space-y-0.5", totals.unposted > 0 ? "border-warning/30" : "")}>
          <span className="text-caption text-muted-foreground">Unposted DPRs</span>
          <div className={cn("text-body font-semibold tnum", totals.unposted > 0 ? "text-warning" : "text-success")}>
            {totals.unposted}
          </div>
        </Card>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-caption text-muted-foreground">From</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-auto" />
        </div>
        <div>
          <label className="text-caption text-muted-foreground">To</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-auto" />
        </div>
        <Button size="sm" variant="outline" onClick={fetchReconciliation} disabled={loading}>
          {loading ? "Loading…" : "Apply filter"}
        </Button>
      </div>

      {/* Reconciliation table */}
      {data.length === 0 && !loading ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No DPRs in this date range"
          description="Select a wider date range or submit DPRs to see the reconciliation."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Project</TH>
                <TH>Work Summary</TH>
                <TH className="text-right">DPR Cost</TH>
                <TH className="text-right">GL Posted</TH>
                <TH className="text-right">Variance</TH>
                <TH>Status</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.dprId}>
                  <TD className="text-caption tnum">{r.date}</TD>
                  <TD className="font-medium">{r.projectName}</TD>
                  <TD className="max-w-xs truncate text-caption text-muted-foreground">{r.workSummary}</TD>
                  <TD className="text-right tnum">{formatCurrency(r.dprTotalCost)}</TD>
                  <TD className="text-right tnum text-success">{formatCurrency(r.postedTotal)}</TD>
                  <TD className={cn("text-right tnum font-medium", r.variance > 0 ? "text-warning" : "text-success")}>
                    {r.variance >= 0 ? "+" : ""}{formatCurrency(r.variance)}
                  </TD>
                  <TD>
                    {r.isPosted ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Posted
                      </Badge>
                    ) : r.variance === 0 && r.postedTotal > 0 ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Reconciled
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <Clock className="mr-1 h-3 w-3" /> Pending
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    {!r.isPosted && (
                      <Button size="sm" variant="ghost" onClick={() => markPosted(r.dprId)}>
                        Mark posted
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
