"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ApprovalClaimRow = {
  id: string;
  claimantName: string;
  projectName: string | null;
  totalAmount: number;
  lineCount: number;
  description: string | null;
  submittedAt: string | null;
  canApprove: boolean;
};

/**
 * Expense claim approval queue — rendered on the /approvals page.
 * Each row shows the claim summary with inline Approve / Reject actions.
 * On approval, each claim line becomes an APPROVED Expense row (GL posted).
 */
export function ClaimApprovalList({ claims }: { claims: ApprovalClaimRow[] }) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalClaimRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function approve(c: ApprovalClaimRow) {
    setActing(`${c.id}-approve`);
    try {
      const res = await fetch(`/api/expense-claims/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      toast.success("Claim approved — expense rows created + GL posted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setActing(`${rejecting.id}-reject`);
    try {
      const res = await fetch(`/api/expense-claims/${rejecting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success("Claim rejected");
      setRejecting(null);
      setRejectReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(null);
    }
  }

  if (claims.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-subhead font-medium text-foreground">Expense Claims</h3>
        <Badge variant="warning">{claims.length}</Badge>
      </div>
      <div className="space-y-1.5">
        {claims.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{c.claimantName}</span>
                {c.projectName && <Badge variant="outline">{c.projectName}</Badge>}
                <Badge variant="muted">{c.lineCount} line{c.lineCount === 1 ? "" : "s"}</Badge>
              </div>
              <div className="text-caption text-muted-foreground mt-0.5">
                {c.description ?? "No description"}
                {c.submittedAt && ` · submitted ${formatDate(c.submittedAt)}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className="font-semibold tnum text-foreground">{formatCurrency(c.totalAmount)}</div>
              </div>
              {c.canApprove ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => approve(c)}
                    disabled={acting === `${c.id}-approve`}
                  >
                    {acting === `${c.id}-approve` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { setRejecting(c); setRejectReason(""); }}
                    disabled={acting === `${c.id}-reject`}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              ) : (
                <span className="text-caption text-muted-foreground italic">Your own claim</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reject dialog */}
      {rejecting && (
        <Dialog
          open={rejecting !== null}
          onOpenChange={(o) => !o && setRejecting(null)}
          title={`Reject claim — ${rejecting.claimantName}`}
          description={`${formatCurrency(rejecting.totalAmount)} · ${rejecting.lineCount} line(s)`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="claim-reject-reason">Reason *</Label>
              <Textarea
                id="claim-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this claim is being rejected…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={reject} disabled={acting === `${rejecting.id}-reject`}>
                {acting === `${rejecting.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject Claim
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
