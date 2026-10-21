"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatNumber } from "@/lib/utils";

export type ApprovalLeaveRow = {
  id: string;
  employeeName: string;
  type: string;
  days: number;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string | null;
};

/**
 * Leave approval queue — rendered on the /approvals page.
 *
 * Leaves were the one approval type the desktop queue never showed, even
 * though the mobile queue and the briefing both counted them. An approver on
 * desktop saw a badge number they could not act on anywhere.
 */
export function LeaveApprovalList({ leaves }: { leaves: ApprovalLeaveRow[] }) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalLeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function act(leave: ApprovalLeaveRow, approve: boolean, reason?: string) {
    setActing(`${leave.id}-${approve ? "approve" : "reject"}`);
    try {
      const res = await fetch(`/api/leaves/${leave.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approve ? { approve: true } : { approve: false, rejectedReason: reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update leave");
      toast.success(approve ? `${leave.employeeName}'s leave approved` : "Leave rejected");
      setRejecting(null);
      setRejectReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Leave update failed");
    } finally {
      setActing(null);
    }
  }

  if (leaves.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarOff className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-subhead font-medium text-foreground">Leave Requests</h3>
        <Badge variant="warning">{leaves.length}</Badge>
      </div>
      <div className="space-y-1.5">
        {leaves.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{l.employeeName}</span>
                <Badge variant="outline">{l.type}</Badge>
                <Badge variant="muted">
                  {formatNumber(l.days)} day{l.days === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="mt-0.5 text-caption text-muted-foreground">
                {formatDate(l.startDate)} → {formatDate(l.endDate)}
                {l.reason ? ` · ${l.reason}` : ""}
              </div>
            </div>
            {/* Reject before Approve, matching every other section on this page —
                a right-most primary is the convention users learn once. */}
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejecting(l);
                  setRejectReason("");
                }}
                disabled={acting === `${l.id}-reject`}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" onClick={() => act(l, true)} disabled={acting === `${l.id}-approve`}>
                {acting === `${l.id}-approve` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve
              </Button>
            </div>
          </div>
        ))}
      </div>

      {rejecting && (
        <Dialog
          open={rejecting !== null}
          onOpenChange={(o) => !o && setRejecting(null)}
          title={`Reject leave — ${rejecting.employeeName}`}
          description={`${rejecting.type} · ${formatDate(rejecting.startDate)} → ${formatDate(rejecting.endDate)}`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="leave-reject-reason">Reason *</Label>
              <Textarea
                id="leave-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this leave is being rejected…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={acting === `${rejecting.id}-reject` || !rejectReason.trim()}
                onClick={() => act(rejecting, false, rejectReason.trim())}
              >
                {acting === `${rejecting.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject Leave
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
