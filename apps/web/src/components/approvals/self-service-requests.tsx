"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2, Banknote, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useHydratedDate } from "@/lib/use-hydrated-date";

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

/** "asked 3d ago" — plain until the 48h aging-digest threshold, then
 *  amber. A stale ask must look stale; a date alone hides it. `now`
 *  comes from useHydratedDate so SSR renders the plain date and the
 *  relative age appears post-mount (no hydration mismatch, no impure
 *  Date.now() inside render). */
function AskAge({ createdAt, now }: { createdAt: string; now: Date | null }) {
  if (!now) return <>{formatDate(createdAt)}</>;
  const days = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000));
  const label = days === 0 ? "asked today" : `asked ${days}d ago`;
  return days >= 2 ? <span className="font-semibold text-amber-600">{label}</span> : <>{label}</>;
}

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
  const now = useHydratedDate();
  const [acting, setActing] = useState<string | null>(null);
  const [recoveries, setRecoveries] = useState<Record<string, string>>({});
  // Reject sends "declined" to the worker — the reason is what they read.
  const [rejecting, setRejecting] = useState<CorrectionRequestRow | (AdvanceRequestRow & { kind: "advance" }) | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  if (advances.length === 0 && corrections.length === 0) return null;

  async function decideAdvanceNote(r: AdvanceRequestRow, note: string) {
    setActing(r.id);
    try {
      const res = await fetch(`/api/employees/${r.employeeId}/advances/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: false, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      toast.success("Advance request rejected");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setActing(null);
    }
  }

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

  async function decideCorrection(r: CorrectionRequestRow, approve: boolean, note?: string) {
    setActing(r.id);
    try {
      const res = await fetch(`/api/employees/${r.employeeId}/attendance-corrections/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
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
                    {r.notes ?? "No reason given"} · <AskAge createdAt={r.createdAt} now={now} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input aria-label="Recoveries"
                    type="number"
                    min="1"
                    placeholder="₹/month"
                    value={recoveries[r.id] ?? ""}
                    onChange={(e) => setRecoveries((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="h-8 w-24"
                  />
                  <Button size="sm" variant="outline" onClick={() => { setRejecting({ ...r, kind: "advance" }); setRejectNote(""); }} disabled={acting === r.id}>
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
                    {formatDate(r.date)} · {r.reason} · <AskAge createdAt={r.createdAt} now={now} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setRejecting(r); setRejectNote(""); }} disabled={acting === r.id}>
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

      {rejecting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          title={`Decline ${"kind" in rejecting && rejecting.kind === "advance" ? "advance" : "correction"} — ${rejecting.employeeName}`}
          description={"kind" in rejecting && rejecting.kind === "advance" ? `${formatCurrency(rejecting.amount)}` : `${formatDate((rejecting as CorrectionRequestRow).date)} · ${(rejecting as CorrectionRequestRow).requestedStatus?.replace(/_/g, " ").toLowerCase()}`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <Textarea aria-label="Why is this being declined? (the worker reads this)"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Why is this being declined? (the worker reads this)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={acting === rejecting.id || !rejectNote.trim()}
                onClick={async () => {
                  if ("kind" in rejecting && rejecting.kind === "advance") {
                    await decideAdvanceNote(rejecting, rejectNote.trim());
                  } else {
                    await decideCorrection(rejecting as CorrectionRequestRow, false, rejectNote.trim());
                  }
                  setRejecting(null);
                }}
              >
                {acting === rejecting.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Decline
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}