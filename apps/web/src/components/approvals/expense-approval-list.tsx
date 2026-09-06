"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2, FileText, Receipt as ReceiptIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApprovalExpenseRow } from "@/lib/types";

/**
 * Expense approval queue — rendered on the /approvals page for users with
 * the expense.approve permission. Each row shows the expense details and
 * inline Approve / Reject actions. Reject requires a reason.
 */
export function ExpenseApprovalList({ expenses }: { expenses: ApprovalExpenseRow[] }) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalExpenseRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function approve(e: ApprovalExpenseRow) {
    setActing(`${e.id}-approve`);
    try {
      const res = await fetch(`/api/expenses/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      toast.success("Expense approved — GL posted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error("A rejection reason is required");
      return;
    }
    setActing(`${rejecting.id}-reject`);
    try {
      const res = await fetch(`/api/expenses/${rejecting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      toast.success("Expense rejected");
      setRejecting(null);
      setRejectReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(null);
    }
  }

  if (expenses.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-subhead font-semibold flex items-center gap-2">
            <ReceiptIcon className="h-4 w-4" /> Expenses Pending Approval
          </h3>
          <Badge variant="warning">{expenses.length}</Badge>
        </div>
        <div className="divide-y divide-border">
          {expenses.map((e) => {
            const gst = e.cgst + e.sgst + e.igst;
            const payee = e.supplierName ?? e.payeeName ?? "—";
            return (
              <div key={e.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{e.category}</span>
                    {e.paymentMode && <Badge variant="outline">{e.paymentMode}</Badge>}
                    {e.receiptUrl && (
                      <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="View receipt">
                        <FileText className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="text-caption text-muted-foreground">
                    {payee}{e.projectName ? ` · ${e.projectName}` : ""}
                    {e.submittedByName ? ` · submitted by ${e.submittedByName}` : ""}
                  </div>
                  <div className="text-caption text-muted-foreground">
                    Dated {formatDate(e.date)}
                    {e.submittedAt ? ` · submitted ${formatDate(e.submittedAt)}` : ""}
                  </div>
                  {/* Payment + tax details for the approver */}
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {e.paymentMode && <Badge variant="outline">{e.paymentMode}</Badge>}
                    {gst > 0 && (
                      <span className="text-caption text-muted-foreground tnum">
                        GST: {formatCurrency(e.cgst)}+{formatCurrency(e.sgst)}+{formatCurrency(e.igst)}
                      </span>
                    )}
                    {e.tdsAmount > 0 && (
                      <span className="text-caption text-muted-foreground tnum">
                        TDS: {formatCurrency(e.tdsAmount)}
                      </span>
                    )}
                  </div>
                  {e.notes && <div className="text-caption text-muted-foreground italic truncate">{e.notes}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="text-right">
                    <div className="font-semibold tnum text-foreground">{formatCurrency(e.amount)}</div>
                    {gst > 0 && <div className="text-caption text-muted-foreground tnum">incl. {formatCurrency(gst)} GST</div>}
                  </div>
                  {e.canApprove && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === `${e.id}-reject`}
                        onClick={() => { setRejecting(e); setRejectReason(""); }}
                      >
                        {acting === `${e.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={acting === `${e.id}-approve`}
                        onClick={() => approve(e)}
                      >
                        {acting === `${e.id}-approve` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rejecting && (
        <Dialog
          open={rejecting !== null}
          onOpenChange={(o) => !o && setRejecting(null)}
          title="Reject Expense"
          description={`Reject ${rejecting.category} expense of ${formatCurrency(rejecting.amount)}? A reason is required.`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-reject-reason">Reason *</Label>
              <Textarea
                id="exp-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this expense being rejected?"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmReject} disabled={acting === `${rejecting.id}-reject`}>
                {acting === `${rejecting.id}-reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject Expense
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
