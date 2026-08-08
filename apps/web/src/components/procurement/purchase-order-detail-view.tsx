"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, X, Package, Printer, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ReceiveGoodsDialog } from "./receive-goods-dialog";
import type { PurchaseOrderDetail } from "@/lib/types";

/**
 * Desktop PO detail view — the page-form sibling of
 * `PurchaseOrderDetailDialog`. Renders the same status/scope header,
 * action buttons (approve / order / cancel / receive / print), line
 * items, totals, and goods-receipt history. Used by `/procurement/[id]`
 * so deep links from the command palette, supplier/material cockpits,
 * and the project hub resolve to a real page instead of 404.
 */
export function PurchaseOrderDetailView({
  po,
  canApprove,
}: {
  po: PurchaseOrderDetail;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PurchaseOrderDetail>(po);
  const [recvOpen, setRecvOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [showApproveField, setShowApproveField] = useState(false);

  async function doAction(action: "approve" | "order" | "cancel") {
    setActing(true);
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "approve") payload.approvalNotes = approvalNotes.trim() || undefined;
      const res = await fetch(`/api/purchase-orders/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (action === "order") {
        toast.success("Order placed with supplier", {
          description: "The supplier has been sent the order. Receive goods when they arrive.",
          action: { label: "Receive Goods", onClick: () => setRecvOpen(true) },
        });
      } else {
        toast.success(`PO ${action}d`);
      }
      setApprovalNotes("");
      setShowApproveField(false);
      // Re-fetch detail
      const r2 = await fetch(`/api/purchase-orders/${detail.id}`);
      if (!r2.ok) throw new Error("Failed to re-fetch purchase order details");
      const d2 = await r2.json();
      if (!d2.error) setDetail(d2);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  const isReceivable = detail.status === "ORDERED" || detail.status === "PARTIAL";

  return (
    <div className="space-y-5">
      {/* Status + meta */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={detail.status} />
        <Badge variant="outline">{detail.procurementScope}</Badge>
        {detail.destinationLocation && (
          <span className="text-meta text-muted-foreground">
            Destination: {detail.destinationLocation.name}
          </span>
        )}
      </div>

      {/* Source links — traceability to requisition + project */}
      <div className="flex flex-wrap items-center gap-3 text-meta">
        {detail.sourceRequisition && (
          <Link
            href={`/requisitions?req=${detail.sourceRequisition.id}`}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Link2 className="h-3 w-3" />
            From requisition {detail.sourceRequisition.reqNumber}
          </Link>
        )}
        {detail.projectId && detail.projectName && (
          <Link
            href={`/projects/${detail.projectId}`}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Link2 className="h-3 w-3" />
            Project: {detail.projectName}
          </Link>
        )}
        {detail.supplier.phone && (
          <span className="text-muted-foreground">Supplier phone: {detail.supplier.phone}</span>
        )}
        {detail.supplier.gstin && (
          <span className="text-muted-foreground">GSTIN: {detail.supplier.gstin}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {detail.status === "DRAFT" && canApprove && !showApproveField && (
          <Button size="sm" onClick={() => setShowApproveField(true)} disabled={acting}>
            <Check className="h-4 w-4" /> Approve
          </Button>
        )}
        {detail.status === "APPROVED" && (
          <Button size="sm" onClick={() => doAction("order")} disabled={acting}>
            <ArrowRight className="h-4 w-4" /> Mark as Ordered
          </Button>
        )}
        {isReceivable && (
          <Button size="sm" onClick={() => setRecvOpen(true)}>
            <Package className="h-4 w-4" /> Receive Goods
          </Button>
        )}
        {(detail.status === "DRAFT" || detail.status === "APPROVED") && (
          <Button size="sm" variant="outline" onClick={() => doAction("cancel")} disabled={acting} className="text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" /> Cancel PO
          </Button>
        )}
        <a
          href={`/print/purchase-order/${detail.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
          title="Print purchase order"
        >
          <Printer className="h-4 w-4" /> Print PO
        </a>
      </div>

      {/* Inline approval notes (appears when approving) */}
      {detail.status === "DRAFT" && canApprove && showApproveField && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <label className="text-meta text-muted-foreground">Approval notes (optional)</label>
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-body outline-none focus:ring-2 focus:ring-ring"
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder="e.g. Budget confirmed, within approved limit…"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowApproveField(false); setApprovalNotes(""); }}>Cancel</Button>
            <Button size="sm" onClick={() => doAction("approve")} disabled={acting}>
              {acting ? "Approving…" : "Confirm Approve"}
            </Button>
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-lg border border-border/60">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Material</TH>
              <TH className="text-right">Ordered</TH>
              <TH className="text-right">Received</TH>
              <TH className="text-right">Remaining</TH>
              <TH className="text-right">Unit Cost</TH>
              <TH className="text-right">Line Total</TH>
            </TR>
          </THead>
          <TBody>
            {detail.lines.map((l) => (
              <TR key={l.id}>
                <TD>
                  <div className="font-medium">{l.materialName}</div>
                  <div className="font-mono text-caption text-muted-foreground">{l.materialCode}</div>
                </TD>
                <TD className="tnum text-right">{formatNumber(l.qtyOrdered, 3)} {l.unit}</TD>
                <TD className="text-right">
                  {l.qtyReceived >= l.qtyOrdered ? (
                    <Badge variant="success" className="px-1.5 py-0 tnum">{formatNumber(l.qtyReceived, 3)}</Badge>
                  ) : l.qtyReceived > 0 ? (
                    <Badge variant="warning" className="px-1.5 py-0 tnum">{formatNumber(l.qtyReceived, 3)}</Badge>
                  ) : (
                    <span className="tnum text-muted-foreground">0</span>
                  )}
                </TD>
                <TD className="tnum text-right">{formatNumber(l.remaining, 3)} {l.unit}</TD>
                <TD className="tnum text-right">{formatCurrency(l.unitCost)}</TD>
                <TD className="tnum text-right font-medium">{formatCurrency(l.lineTotal)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="flex justify-end gap-5 text-body">
        <span className="tnum">Subtotal: <strong>{formatCurrency(detail.subtotal)}</strong></span>
        <span className="tnum">GST: <strong>{formatCurrency(detail.gstTotal)}</strong></span>
        <span className="tnum text-base">Total: <strong>{formatCurrency(detail.total)}</strong></span>
      </div>

      {/* Receipts history */}
      {detail.receipts.length > 0 && (
        <div className="space-y-2">
          <p className="text-body font-medium">Goods Receipts</p>
          <div className="rounded-lg border border-border/60">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Date</TH>
                  <TH>Inspection</TH>
                  <TH>Lines</TH>
                  <TH>Notes</TH>
                  <TH className="w-16">Challan</TH>
                </TR>
              </THead>
              <TBody>
                {detail.receipts.map((r) => (
                  <TR key={r.id}>
                    <TD>{formatDate(r.receiptDate)}</TD>
                    <TD>
                      <StatusPill status={r.inspectionStatus} />
                    </TD>
                    <TD className="tnum">{r.lineCount}</TD>
                    <TD className="max-w-[200px] truncate text-muted-foreground">{r.notes ?? "—"}</TD>
                    <TD>
                      <a
                        href={`/print/goods-receipt/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        title="Print challan"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      {detail.notes && (
        <div className="rounded-lg bg-muted/50 p-3 text-body">
          <span className="font-medium">Notes: </span>{detail.notes}
        </div>
      )}

      <ReceiveGoodsDialog open={recvOpen} onOpenChange={setRecvOpen} po={detail} />
    </div>
  );
}
