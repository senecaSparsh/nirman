"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Truck,
  Printer,
  Ban,
  Send,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import type { GatePassRow } from "./gate-passes-view";

const STATUS_CONFIG: Record<GatePassRow["status"], { label: string; color: string; dot: string }> = {
  DRAFT: { label: "Draft", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  PENDING: { label: "Pending", color: "text-warning", dot: "bg-warning" },
  APPROVED: { label: "Approved", color: "text-success", dot: "bg-success" },
  REJECTED: { label: "Rejected", color: "text-danger", dot: "bg-danger" },
  EXITED: { label: "Exited", color: "text-info", dot: "bg-info" },
  CANCELLED: { label: "Cancelled", color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const CATEGORY_LABELS: Record<GatePassRow["category"], string> = {
  MATERIAL_ISSUE: "Material Issue",
  STOCK_TRANSFER: "Stock Transfer",
  MATERIAL_SALE: "Material Sale",
  SUPPLIER_RETURN: "Supplier Return",
  MANUAL: "Manual",
};

function getSourceLink(refType: string, refId: string): string {
  switch (refType) {
    case "MaterialIssue": return `/stock?issue=${refId}`;
    case "StockTransfer": return `/stock?transfer=${refId}`;
    case "MaterialSale": return `/material-sales?sale=${refId}`;
    case "SupplierReturn": return `/procurement?return=${refId}`;
    default: return "#";
  }
}

export function GatePassDetailDialog({
  gatePass,
  onClose,
  permissions,
  onAction,
  actionLoading,
}: {
  gatePass: GatePassRow;
  onClose: () => void;
  permissions: { canCreate: boolean; canApprove: boolean; canExit: boolean; canManage: boolean };
  onAction: (id: string, action: string, body?: Record<string, unknown>) => void;
  actionLoading: boolean;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [exitNotes, setExitNotes] = useState("");
  const cfg = STATUS_CONFIG[gatePass.status];

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={`${gatePass.gatePassNumber} — Gate Pass`}
        description={`${CATEGORY_LABELS[gatePass.category]} · ${gatePass.locationName}`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
            <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>

          {/* Items table */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Code</th>
                    <th className="px-3 py-2 text-left font-medium">Description / Material</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {gatePass.lines.map((l) => (
                    <tr key={l.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-caption text-muted-foreground">{l.materialCode ?? "—"}</td>
                      <td className="px-3 py-2 text-body">{l.materialName ?? l.description ?? "—"}</td>
                      <td className="px-3 py-2 text-right tnum font-medium">{formatNumber(l.qty, 3)}</td>
                      <td className="px-3 py-2 text-caption text-muted-foreground">{l.unit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vehicle + destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transport</h3>
              <dl className="space-y-1 text-caption">
                <div className="flex justify-between"><dt className="text-muted-foreground">Vehicle</dt><dd className="font-medium">{gatePass.vehicleNumber ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Driver</dt><dd className="font-medium">{gatePass.driverName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Driver Phone</dt><dd className="font-medium">{gatePass.driverPhone ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Transporter</dt><dd className="font-medium">{gatePass.transporterName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Destination</dt><dd className="font-medium">{gatePass.destination ?? "—"}</dd></div>
                {gatePass.purpose && <div className="flex justify-between"><dt className="text-muted-foreground">Purpose</dt><dd className="font-medium">{gatePass.purpose}</dd></div>}
              </dl>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approval Timeline</h3>
              <dl className="space-y-1 text-caption">
                <div className="flex justify-between"><dt className="text-muted-foreground">Created by</dt><dd className="font-medium">{gatePass.createdByName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Submitted by</dt><dd className="font-medium">{gatePass.submittedByName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Submitted at</dt><dd className="font-medium">{gatePass.submittedAt ? new Date(gatePass.submittedAt).toLocaleString() : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Approved by</dt><dd className="font-medium">{gatePass.approvedByName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Approved at</dt><dd className="font-medium">{gatePass.approvedAt ? new Date(gatePass.approvedAt).toLocaleString() : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Exited by</dt><dd className="font-medium">{gatePass.exitedByName ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Exited at</dt><dd className="font-medium">{gatePass.exitedAt ? new Date(gatePass.exitedAt).toLocaleString() : "—"}</dd></div>
              </dl>
            </div>
          </div>

          {/* Approval notes */}
          {gatePass.approvalNotes && (
            <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-caption">
              <span className="font-medium text-success">Approval Notes:</span> {gatePass.approvalNotes}
            </div>
          )}

          {/* Rejection reason */}
          {gatePass.status === "REJECTED" && gatePass.rejectionReason && (
            <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-caption text-danger">
              <span className="font-medium">Rejected:</span> {gatePass.rejectionReason}
              {gatePass.rejectedByName && <div className="mt-0.5 text-meta">by {gatePass.rejectedByName}</div>}
            </div>
          )}

          {/* Source transaction link */}
          {gatePass.refType && gatePass.refId && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-caption">
              <span className="text-muted-foreground">Linked to:</span>
              <span className="font-medium">{CATEGORY_LABELS[gatePass.category]}</span>
              <a
                href={getSourceLink(gatePass.refType, gatePass.refId)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-brand hover:underline"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Notes */}
          {gatePass.notes && (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-caption text-muted-foreground">
              <span className="font-medium text-foreground">Notes:</span> {gatePass.notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={() => window.open(`/print/gate-pass/${gatePass.id}`, "_blank")}>
              <Printer className="mr-1 h-3.5 w-3.5" /> Print
            </Button>

            {gatePass.status === "DRAFT" && permissions.canCreate && (
              <Button size="sm" disabled={actionLoading} onClick={() => onAction(gatePass.id, "submit")}>
                <Send className="mr-1 h-3.5 w-3.5" /> Submit for Approval
              </Button>
            )}

            {gatePass.status === "PENDING" && permissions.canApprove && (
              <>
                <Button size="sm" variant="outline" disabled={actionLoading} onClick={() => setRejectOpen(true)}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
                <Button size="sm" disabled={actionLoading} onClick={() => onAction(gatePass.id, "approve")}>
                  <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
              </>
            )}

            {gatePass.status === "APPROVED" && permissions.canExit && (
              <Button size="sm" disabled={actionLoading} onClick={() => setExitOpen(true)}>
                <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Confirm Exit
              </Button>
            )}

            {(gatePass.status === "DRAFT" || gatePass.status === "PENDING") && permissions.canManage && (
              <Button size="sm" variant="ghost" disabled={actionLoading} onClick={() => onAction(gatePass.id, "cancel")}>
                <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
            )}

            {gatePass.status === "REJECTED" && permissions.canCreate && (
              <Button size="sm" variant="outline" disabled={actionLoading} onClick={() => onAction(gatePass.id, "resubmit")}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Resubmit
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* Reject dialog */}
      {rejectOpen && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejectOpen(false)}
          title={`Reject ${gatePass.gatePassNumber}`}
          className="max-w-sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejectReason.trim()) return;
              onAction(gatePass.id, "reject", { reason: rejectReason.trim() });
              setRejectOpen(false);
              setRejectReason("");
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason *</Label>
              <Textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Why is this gate pass being rejected?" required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={actionLoading || !rejectReason.trim()}>Reject Gate Pass</Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Confirm exit dialog */}
      {exitOpen && (
        <Dialog
          open
          onOpenChange={(o) => !o && setExitOpen(false)}
          title={`Confirm Exit — ${gatePass.gatePassNumber}`}
          description="Confirm that the items have physically left the gate."
          className="max-w-sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAction(gatePass.id, "confirmExit", { exitNotes: exitNotes.trim() || undefined });
              setExitOpen(false);
              setExitNotes("");
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="exit-notes">Exit Notes</Label>
              <Textarea id="exit-notes" value={exitNotes} onChange={(e) => setExitNotes(e.target.value)} rows={2} placeholder="Optional — any observations at the gate" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExitOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={actionLoading}>
                <Truck className="mr-1 h-3.5 w-3.5" /> Confirm Items Exited
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
