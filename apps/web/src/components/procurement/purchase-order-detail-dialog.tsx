"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X, Package, Printer, Link2, IndianRupee } from "lucide-react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ReceiveGoodsDialog } from "./receive-goods-dialog";
import { SupplierPaymentFormDialog } from "./supplier-payment-form-dialog";
import { AuditTrail } from "@/components/audit-trail";
import { useTrackRecent } from "@/lib/use-recently-viewed";
import type { PurchaseOrderDetail, PurchaseOrderRow, SupplierRow } from "@/lib/types";

export function PurchaseOrderDetailDialog({
  open,
  onOpenChange,
  po,
  canApprove = true,
  suppliers = [],
  canManagePayments = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrderRow | null;
  canApprove?: boolean;
  suppliers?: SupplierRow[];
  canManagePayments?: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<{ id: string; paymentNumber: string; amount: number; paymentDate: string; paymentMode: string; referenceNo: string | null }[]>([]);
  const [acting, setActing] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [showApproveField, setShowApproveField] = useState(false);
  const trackRecent = useTrackRecent();

  useEffect(() => {
    if (open && po) {
      setLoading(true);
      setDetail(null);
      setPayments([]);
      fetch(`/api/purchase-orders/${po.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .catch(() => toast.error("Failed to load purchase order details"))
        .finally(() => setLoading(false));
      // Fetch supplier payments linked to this PO
      fetch(`/api/supplier-payments?purchaseOrderId=${po.id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setPayments(d); })
        .catch(() => {/* best-effort */});
      // Track in recently viewed
      trackRecent({ type: "po", id: po.id, label: po.poNumber, href: `/procurement/${po.id}` });
    }
  }, [open, po, trackRecent]);

  async function doAction(action: "approve" | "order" | "cancel") {
    if (!po) return;
    setActing(true);
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "approve") payload.approvalNotes = approvalNotes.trim() || undefined;
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (action === "order") {
        toast.success("Order placed with supplier", {
          description: "The supplier has been sent the order. Receive goods when they arrive.",
          action: {
            label: "Receive Goods",
            onClick: () => setRecvOpen(true),
          },
        });
      } else {
        toast.success(`PO ${action}d`);
      }
      setApprovalNotes("");
      setShowApproveField(false);
      // Re-fetch detail
      const r2 = await fetch(`/api/purchase-orders/${po.id}`);
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

  if (!po) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={po.poNumber}
        description={`${po.supplierName} · ${po.procurementScope === "COMPANY" ? "Company scope" : `Project: ${po.projectName ?? "—"}`}`}
        className="max-w-3xl"
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="space-y-3">
            {/* Status + meta */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={detail.status} />
              <Badge variant="outline">{detail.procurementScope}</Badge>
              <span className="text-meta text-muted-foreground">
                Destination: {detail.destinationLocation.name}
              </span>
            </div>

            {/* Source links — traceability to requisition + project */}
            <div className="flex flex-wrap items-center gap-3 text-meta">
              {detail.sourceRequisition && (
                <Link
                  href={`/requisitions?req=${detail.sourceRequisition.id}`}
                  className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  <Link2 className="h-3 w-3" />
                  From requisition {detail.sourceRequisition.reqNumber}
                </Link>
              )}
              {detail.projectId && detail.projectName && (
                <Link
                  href={`/projects/${detail.projectId}`}
                  className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  <Link2 className="h-3 w-3" />
                  Project: {detail.projectName}
                </Link>
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
              {(detail.status === "ORDERED" || detail.status === "PARTIAL") && (
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
              {canManagePayments && (detail.status === "PARTIAL" || detail.status === "RECEIVED") && (
                <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                  <IndianRupee className="h-4 w-4" /> Record Payment
                </Button>
              )}
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

            {/* Payment history */}
            {payments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-body font-medium">Supplier Payments</p>
                  <span className="text-caption text-muted-foreground tnum">
                    Paid: {formatCurrency(payments.reduce((s, p) => s + p.amount, 0))} / {formatCurrency(detail.total)}
                  </span>
                </div>
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Payment No</TH>
                        <TH>Date</TH>
                        <TH>Mode</TH>
                        <TH>Reference</TH>
                        <TH className="text-right">Amount</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {payments.map((p) => (
                        <TR key={p.id}>
                          <TD className="font-mono text-caption">
                            <a href={`/print/supplier-payment/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{p.paymentNumber}</a>
                          </TD>
                          <TD>{formatDate(p.paymentDate)}</TD>
                          <TD><Badge variant="outline">{p.paymentMode}</Badge></TD>
                          <TD className="text-muted-foreground">{p.referenceNo ?? "—"}</TD>
                          <TD className="tnum text-right font-medium">{formatCurrency(p.amount)}</TD>
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

            <AuditTrail entityType="PurchaseOrder" entityId={detail.id} />
          </div>
        ) : (
          <p className="py-10 text-center text-body text-muted-foreground">Failed to load PO.</p>
        )}
      </Dialog>

      <ReceiveGoodsDialog open={recvOpen} onOpenChange={setRecvOpen} po={detail} />
      <SupplierPaymentFormDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        suppliers={suppliers}
        purchaseOrderId={detail?.id}
        purchaseOrderNumber={detail?.poNumber}
        defaultSupplierId={detail?.supplierId}
        defaultAmount={detail ? Math.max(0, detail.total - payments.reduce((s, p) => s + p.amount, 0)) : undefined}
      />
    </>
  );
}
