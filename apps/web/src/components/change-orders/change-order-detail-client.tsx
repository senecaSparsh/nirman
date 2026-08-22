"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { Send, Check, X, Play, Ban, Trash2, ArrowUpRight, ArrowDownRight, Clock, Loader2 } from "lucide-react";

interface ChangeOrderDetail {
  id: string;
  changeOrderNo: string;
  title: string;
  description: string;
  type: string;
  reason: string;
  status: string;
  projectName: string;
  phaseName: string | null;
  originalAmount: number;
  revisedAmount: number;
  costDelta: number;
  scheduleDeltaDays: number;
  clientApprovalRequired: boolean;
  clientApprovedBy: string | null;
  clientApprovedAt: string | null;
  initiatedBy: string | null;
  notes: string | null;
  rejectReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  implementedByName: string | null;
  lines: Array<{
    id: string;
    description: string;
    originalQty: number;
    revisedQty: number;
    unit: string;
    rate: number;
    originalAmount: number;
    revisedAmount: number;
    amountDelta: number;
    boqItemSerial: string | null;
    boqItemDescription: string | null;
    notes: string | null;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  ADDITION: "Addition", DELETION: "Deletion", MODIFICATION: "Modification",
  ACCELERATION: "Acceleration", DECELERATION: "Deceleration", VARIATION: "Variation",
};

const REASON_LABELS: Record<string, string> = {
  CLIENT_REQUEST: "Client Request", SITE_CONDITION: "Site Condition", DESIGN_CHANGE: "Design Change",
  ERROR_OMISSION: "Error / Omission", REGULATORY: "Regulatory", VALUE_ENGINEERING: "Value Engineering", OTHER: "Other",
};

const STATUS_TONES: Record<string, "default" | "warning" | "success" | "danger"> = {
  DRAFT: "default", SUBMITTED: "warning", APPROVED: "success", REJECTED: "danger", IMPLEMENTED: "success", CANCELLED: "default",
};

export function ChangeOrderDetailClient({
  co,
  canManage,
}: {
  co: ChangeOrderDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [clientApprovedBy, setClientApprovedBy] = useState("");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/change-orders/${co.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Change order ${action}ed`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
      setShowReject(false);
      setShowApprove(false);
      setRejectReason("");
      setClientApprovedBy("");
    }
  }

  const costDeltaPositive = co.costDelta > 0;
  const costDeltaNegative = co.costDelta < 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{co.changeOrderNo}</span>
            <Badge variant={STATUS_TONES[co.status] ?? "default"}>{co.status}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {TYPE_LABELS[co.type]} · {REASON_LABELS[co.reason]}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{co.description}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Project: <span className="font-medium text-foreground">{co.projectName}</span></span>
          {co.phaseName && <span>Phase: <span className="font-medium text-foreground">{co.phaseName}</span></span>}
          {co.initiatedBy && <span>Initiated by: <span className="font-medium text-foreground">{co.initiatedBy}</span></span>}
        </div>
      </div>

      {/* Impact summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ImpactCard label="Original Amount" value={formatCurrency(co.originalAmount)} />
        <ImpactCard label="Revised Amount" value={formatCurrency(co.revisedAmount)} />
        <ImpactCard
          label="Cost Delta"
          value={`${costDeltaPositive ? "+" : ""}${formatCurrency(co.costDelta)}`}
          tone={costDeltaPositive ? "danger" : costDeltaNegative ? "go" : "neutral"}
        />
        <ImpactCard
          label="Schedule Delta"
          value={`${co.scheduleDeltaDays > 0 ? "+" : ""}${co.scheduleDeltaDays} days`}
          tone={co.scheduleDeltaDays > 0 ? "danger" : co.scheduleDeltaDays < 0 ? "go" : "neutral"}
        />
      </div>

      {/* Lines table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          Line Items ({co.lines.length})
        </div>
        <div className="grid grid-cols-[1fr_100px_100px_60px_100px_120px_120px] gap-2 border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <div>Description</div>
          <div className="text-right">Old Qty</div>
          <div className="text-right">New Qty</div>
          <div>Unit</div>
          <div className="text-right">Rate</div>
          <div className="text-right">Revised Amt</div>
          <div className="text-right">Delta</div>
        </div>
        {co.lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_100px_100px_60px_100px_120px_120px] gap-2 border-b border-border/50 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{l.description}</div>
              {l.boqItemSerial && (
                <div className="text-xs text-muted-foreground">BOQ: {l.boqItemSerial} — {l.boqItemDescription}</div>
              )}
              {l.notes && <div className="text-xs text-muted-foreground">{l.notes}</div>}
            </div>
            <div className="text-right tabular-nums">{l.originalQty}</div>
            <div className="text-right tabular-nums">{l.revisedQty}</div>
            <div className="text-muted-foreground">{l.unit}</div>
            <div className="text-right tabular-nums">{formatCurrency(l.rate)}</div>
            <div className="text-right tabular-nums font-medium">{formatCurrency(l.revisedAmount)}</div>
            <div className={cn("text-right tabular-nums font-medium", l.amountDelta > 0 ? "text-destructive" : l.amountDelta < 0 ? "text-green-600" : "text-muted-foreground")}>
              {l.amountDelta > 0 ? "+" : ""}{formatCurrency(l.amountDelta)}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Approval Timeline</h3>
        <div className="space-y-2">
          <TimelineRow label="Created" date={co.createdAt} />
          {co.submittedAt && <TimelineRow label="Submitted" date={co.submittedAt} name={co.submittedByName} />}
          {co.approvedAt && <TimelineRow label="Approved" date={co.approvedAt} name={co.approvedByName} />}
          {co.clientApprovedBy && <TimelineRow label="Client Approved" date={co.clientApprovedAt ?? co.approvedAt ?? co.createdAt} name={co.clientApprovedBy} />}
          {co.implementedAt && <TimelineRow label="Implemented" date={co.implementedAt} name={co.implementedByName} />}
          {co.rejectReason && (
            <div className="mt-2 rounded-md bg-destructive/10 p-2">
              <p className="text-sm font-semibold text-destructive">Rejected</p>
              <p className="text-sm text-muted-foreground">{co.rejectReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {co.notes && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-2">Notes</h3>
          <p className="text-sm text-muted-foreground">{co.notes}</p>
        </div>
      )}

      {/* Workflow actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(co.status === "DRAFT" || co.status === "REJECTED") && (
            <Button onClick={() => doAction("submit")} disabled={acting === "submit"}>
              {acting === "submit" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Submit for Approval
            </Button>
          )}
          {co.status === "SUBMITTED" && (
            <>
              <Button
                variant="default"
                onClick={() => co.clientApprovalRequired ? setShowApprove(true) : doAction("approve")}
                disabled={acting === "approve"}
              >
                {acting === "approve" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Approve
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {co.status === "APPROVED" && (
            <Button onClick={() => doAction("implement")} disabled={acting === "implement"}>
              {acting === "implement" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
              Implement (Apply to BOQ)
            </Button>
          )}
          {(co.status === "DRAFT" || co.status === "REJECTED") && (
            <Button variant="outline" onClick={() => doAction("cancel")} disabled={acting === "cancel"}>
              <Ban className="mr-1 h-4 w-4" /> Cancel
            </Button>
          )}
          {(co.status === "DRAFT" || co.status === "REJECTED" || co.status === "CANCELLED") && (
            <Button
              variant="ghost"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete change order?",
                  description: "This action cannot be undone.",
                  confirmLabel: "Delete",
                  variant: "destructive",
                });
                if (!ok) return;
                await doAction("delete");
                router.push("/change-orders");
              }}
              disabled={acting === "delete"}
            >
              {acting === "delete" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Delete
            </Button>
          )}
        </div>
      )}

      {/* Reject dialog */}
      {showReject && (
        <Dialog
          open={showReject}
          onOpenChange={setShowReject}
          title="Reject Change Order"
          description="Provide a reason for rejection."
        >
          <div className="space-y-3">
            <Field label="Reason" required>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this change order being rejected?"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!rejectReason.trim()) { toast.error("Reason is required"); return; }
                  doAction("reject", { reason: rejectReason });
                }}
                disabled={acting === "reject"}
              >
                {acting === "reject" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                Confirm Rejection
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Approve dialog */}
      {showApprove && (
        <Dialog
          open={showApprove}
          onOpenChange={setShowApprove}
          title="Approve Change Order"
          description="Record the client's approval."
        >
          <div className="space-y-3">
            <Field label="Client Approval By" required>
              <Input
                value={clientApprovedBy}
                onChange={(e) => setClientApprovedBy(e.target.value)}
                placeholder="Client name (who approved)"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!clientApprovedBy.trim()) { toast.error("Client name is required"); return; }
                  doAction("approve", { clientApprovedBy });
                }}
                disabled={acting === "approve"}
              >
                {acting === "approve" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Confirm Approval
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {confirmDialog}
    </div>
  );
}

function ImpactCard({ label, value, tone }: { label: string; value: string; tone?: "danger" | "go" | "neutral" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "go" ? "text-green-600" : "";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        <span className="font-medium">{label}</span>
        {name && <span className="text-muted-foreground"> — by {name}</span>}
      </div>
      <span className="text-muted-foreground tabular-nums">{formatDate(date)}</span>
    </div>
  );
}
