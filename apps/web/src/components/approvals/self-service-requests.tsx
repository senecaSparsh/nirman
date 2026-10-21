"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2, Banknote, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDate, formatCurrency } from "@/lib/utils";

export type AdvanceRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  notes: string | null;
  createdAt: string;
};

export type CorrectionRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  requestedStatus: string;
  reason: string;
  createdAt: string;
};

/**
 * Self-service asks in the approvals queue — the worker's advance request
 * and punch-correction land here so they can't rot on a dossier nobody
 * opened. Advance approve needs the monthly recovery (HR negotiates the
 * terms before cash leaves); correction approve writes the day's row.
 */
export function SelfServiceRequestList({
  advances,
  corrections,
}: {
  advances: AdvanceRequestRow[];
  corrections: CorrectionRequestRow[];
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [recoveries, setRecoveries] = useState<Record<string, string>>({});

  if (advances.length === 0 && corrections.length === 0) return null;

  async function decideAdvance(r: AdvanceRequestRow, approve: boolean) {
    const rec = approve ? Number(recoveries[r.id]) : undefined;
    if (approve && (!rec || rec <= 0)) {
      toast.error("Enter the monthly recovery first");
      return;
    }
    if (approve && rec! > r.amount) {
      toast.error("Recovery can't exceed the advance amount");
      return;
    }
    setActing(r.id);
    try {
      const res = await fetch(`/api/employees/${r.employeeId}/advances/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, monthlyRecovery: rec }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      toast.success(approve ? `Approved — recovers ${formatCurrency(rec!)} / month` : "Advance request rejected");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setActing(null);
    }
  }

  async function decideCorrection(r: CorrectionRequestRow, approve: boolean) {
    setActing(r.id);
    try {
      const res = await fetch(`/api/employees/${r.employeeId}/attendance-corrections/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      toast.success(approve ? `${r.employeeName}'s day corrected` : "Correction declined");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-4">
      {advances.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-subhead font-medium text-foreground">Advance Requests</h3>
            <Badge variant="warning">{advances.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {advances.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.employeeName}</span>
                    <span className="tnum font-semibold text-foreground">{formatCurrency(r.amount)}</span>
                  </div>
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {r.notes ?? "No reason given"} · asked {formatDate(r.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    placeholder="₹/month"
                    value={recoveries[r.id] ?? ""}
                    onChange={(e) => setRecoveries((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="h-8 w-24"
                  />
                  <Button size="sm" variant="outline" onClick={() => decideAdvance(r, false)} disabled={acting === r.id}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => decideAdvance(r, true)} disabled={acting === r.id}>
                    {acting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {corrections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-subhead font-medium text-foreground">Punch-Fix Requests</h3>
            <Badge variant="warning">{corrections.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {corrections.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.employeeName}</span>
                    <Badge variant="outline">{r.requestedStatus.replace(/_/g, " ").toLowerCase()}</Badge>
                  </div>
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {formatDate(r.date)} · {r.reason}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => decideCorrection(r, false)} disabled={acting === r.id}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => decideCorrection(r, true)} disabled={acting === r.id}>
                    {acting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
