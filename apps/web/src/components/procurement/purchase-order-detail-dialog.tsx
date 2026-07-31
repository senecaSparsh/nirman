"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X, Package } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ReceiveGoodsDialog } from "./receive-goods-dialog";
import type { PurchaseOrderDetail, PurchaseOrderRow } from "@/lib/types";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted",
  APPROVED: "default",
  ORDERED: "warning",
  PARTIAL: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

export function PurchaseOrderDetailDialog({
  open,
  onOpenChange,
  po,
  canApprove = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrderRow | null;
  canApprove?: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (open && po) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/purchase-orders/${po.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .finally(() => setLoading(false));
    }
  }, [open, po]);

  async function doAction(action: "approve" | "order" | "cancel") {
    if (!po) return;
    setActing(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`PO ${action}d`);
      // Re-fetch detail
      const r2 = await fetch(`/api/purchase-orders/${po.id}`);
      const d2 = await r2.json();
      if (!d2.error) setDetail(d2);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
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
              <Badge variant={STATUS_VARIANT[detail.status] ?? "muted"}>{detail.status.replace("_", " ")}</Badge>
              <Badge variant="outline">{detail.procurementScope}</Badge>
              <span className="text-meta text-muted-foreground">
                Destination: {detail.destinationLocation.name}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {detail.status === "DRAFT" && canApprove && (
                <Button size="sm" onClick={() => doAction("approve")} disabled={acting}>
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
            </div>

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
                      </TR>
                    </THead>
                    <TBody>
                      {detail.receipts.map((r) => (
                        <TR key={r.id}>
                          <TD>{formatDate(r.receiptDate)}</TD>
                          <TD>
                            <Badge variant={r.inspectionStatus === "PASSED" ? "success" : r.inspectionStatus === "FAILED" || r.inspectionStatus === "REJECTED" ? "danger" : "muted"}>
                              {r.inspectionStatus}
                            </Badge>
                          </TD>
                          <TD className="tnum">{r.lineCount}</TD>
                          <TD className="max-w-[200px] truncate text-muted-foreground">{r.notes ?? "—"}</TD>
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
          </div>
        ) : (
          <p className="py-10 text-center text-body text-muted-foreground">Failed to load PO.</p>
        )}
      </Dialog>

      <ReceiveGoodsDialog open={recvOpen} onOpenChange={setRecvOpen} po={detail} />
    </>
  );
}
