"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, X, Printer, CheckCircle2, HandCoins, MessageCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { PaymentDialog } from "./payment-dialog";
import { DepositDialog } from "./deposit-dialog";
import { CompleteSaleDialog } from "./complete-sale-dialog";
import { useTrackRecent } from "@/lib/use-recently-viewed";
import type { AssetSaleDetail, AssetSaleRow } from "@/lib/types";

export function SaleDetailDialog({
  open,
  onOpenChange,
  sale,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AssetSaleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const trackRecent = useTrackRecent();

  useEffect(() => {
    if (open && sale) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/sales/${sale.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .catch(() => toast.error("Failed to load sale details"))
        .finally(() => setLoading(false));
      // Track in recently viewed
      trackRecent({ type: "sale", id: sale.id, label: sale.saleNumber, href: `/sales?sale=${sale.id}` });
    }
  }, [open, sale, trackRecent]);

  async function cancelSale() {
    if (!sale) return;
    setActing(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      toast.success("Sale cancelled", {
        description: sale.depositAmount ? "Deposit refunded. Asset released." : "Asset released back to available.",
      });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  async function sendWhatsAppConfirmation(paymentId: string) {
    if (!sale) return;
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resendConfirmation", paymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send confirmation");
      toast.success("WhatsApp confirmation sent", {
        description: "The payment receipt has been sent to the customer's WhatsApp.",
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send confirmation");
    }
  }

  if (!sale) return null;

  // Use detail if loaded, otherwise fall back to the row passed in
  const d: AssetSaleDetail | null = detail;
  const payments = d?.payments ?? [];
  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${sale.landParcelNumber ?? "—"}`
    : `Unit ${sale.builtUnitNumber ?? "—"}${sale.builtUnitType ? ` (${sale.builtUnitType.replace("_", " ")})` : ""}`;

  const saleStage = sale.saleStage ?? (sale.status === "CANCELLED" ? "CANCELLED" : "COMPLETED");
  const isCancelled = sale.status === "CANCELLED";
  const isCompleted = saleStage === "COMPLETED";
  const isPending = saleStage === "PENDING";
  const hasDeposit = saleStage === "DEPOSIT_RECEIVED";
  const canManage = permissions?.canManage ?? false;

  // Cancel is allowed for PENDING and DEPOSIT_RECEIVED stages (not COMPLETED)
  const canCancel = !isCancelled && !isCompleted && canManage;
  // Record Deposit: only for PENDING sales (no deposit yet)
  const canRecordDeposit = isPending && !isCancelled && canManage;
  // Complete Sale: only for sales with a deposit (DEPOSIT_RECEIVED)
  const canCompleteSale = hasDeposit && !isCancelled && canManage;
  // Record Payment: for completed sales with balance due, or deposit sales
  const canRecordPayment = !isCancelled && sale.balanceDue > 0 && !isPending && canManage;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={sale.saleNumber}
        description={`${assetLabel} · ${sale.customerName}`}
        className="max-w-2xl"
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={sale.status} />
              <StatusPill status={saleStage} />
              <StatusPill status={sale.paymentStatus} />
              <span className="text-meta text-muted-foreground">{formatDate(sale.saleDate)}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {canRecordDeposit && (
                <Button size="sm" onClick={() => setDepositOpen(true)} disabled={acting}>
                  <HandCoins className="h-4 w-4" /> Record Deposit
                </Button>
              )}
              {canCompleteSale && (
                <Button size="sm" onClick={() => setCompleteOpen(true)} disabled={acting}>
                  <CheckCircle2 className="h-4 w-4" /> Complete Sale
                </Button>
              )}
              {canRecordPayment && (
                <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} disabled={acting}>
                  <Banknote className="h-4 w-4" /> Record Payment
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={acting} className="text-muted-foreground hover:text-danger">
                  <X className="h-4 w-4" /> {acting ? "Cancelling…" : "Cancel Sale"}
                </Button>
              )}
              <a
                href={`/print/sale-invoice/${sale.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
                title="Print sale invoice"
              >
                <Printer className="h-4 w-4" /> Print Invoice
              </a>
            </div>

            {/* Sale summary */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-4 text-body sm:grid-cols-5">
              <div>
                <p className="text-caption text-muted-foreground">Sale Price</p>
                <p className="tnum font-medium">{formatCurrency(sale.salePrice)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">GST {sale.gstRate ? `@ ${sale.gstRate}%` : ""}</p>
                <p className="tnum font-medium">{formatCurrency(sale.gstAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Cost Basis</p>
                <p className="tnum font-medium">{formatCurrency(sale.costBasis)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Profit</p>
                <p className={`tnum font-medium ${sale.profit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(sale.profit)}
                </p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Balance Due</p>
                <p className="tnum font-medium text-warning">{formatCurrency(sale.balanceDue)}</p>
              </div>
            </div>

            {/* Deposit info (if deposit received) */}
            {sale.depositAmount != null && sale.depositAmount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <HandCoins className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    Deposit: {formatCurrency(sale.depositAmount)}
                    {sale.depositDate && <span className="ml-2 text-caption text-muted-foreground">on {formatDate(sale.depositDate)}</span>}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {isCompleted
                      ? "Deposit settled against receivable on completion."
                      : "Recorded as liability. Revenue not yet recognised."}
                  </p>
                </div>
              </div>
            )}

            {/* Completion info */}
            {isCompleted && sale.finalSaleDate && (
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft/20 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    Sale completed on {formatDate(sale.finalSaleDate)}
                  </p>
                  <p className="text-caption text-muted-foreground">Revenue + COGS recognised. Title transferred.</p>
                </div>
              </div>
            )}

            {/* Payment progress + next step */}
            {!isCancelled && sale.balanceDue > 0 && !isPending && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <Banknote className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    {formatCurrency(sale.totalPaid)} paid · {formatCurrency(sale.balanceDue)} remaining
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {sale.paymentCount} payment{sale.paymentCount !== 1 ? "s" : ""} recorded so far
                  </p>
                </div>
                {canManage && hasDeposit && (
                  <Button size="sm" onClick={() => setCompleteOpen(true)} disabled={acting}>
                    <CheckCircle2 className="h-4 w-4" /> Complete Sale
                  </Button>
                )}
                {canManage && isCompleted && (
                  <Button size="sm" onClick={() => setPayOpen(true)} disabled={acting}>
                    <Banknote className="h-4 w-4" /> Record Next Payment
                  </Button>
                )}
              </div>
            )}

            {/* Pending sale prompt */}
            {isPending && !isCancelled && (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <HandCoins className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">Sale pending — no deposit yet</p>
                  <p className="text-caption text-muted-foreground">Record a deposit to reserve the asset, or cancel to release it.</p>
                </div>
                {canManage && (
                  <Button size="sm" onClick={() => setDepositOpen(true)} disabled={acting}>
                    <HandCoins className="h-4 w-4" /> Record Deposit
                  </Button>
                )}
              </div>
            )}

            {/* Asset + customer info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 p-3 text-body">
                <p className="mb-1 text-caption font-medium text-muted-foreground">Asset</p>
                <p className="font-medium">{assetLabel}</p>
                {sale.assetArea != null && (
                  <p className="tnum text-muted-foreground">{formatNumber(sale.assetArea)} {sale.assetAreaUnit ?? ""}</p>
                )}
                <p className="text-muted-foreground">{sale.projectName}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 text-body">
                <p className="mb-1 text-caption font-medium text-muted-foreground">Customer</p>
                <p className="font-medium">{sale.customerName}</p>
                {sale.customerPhone && <p className="text-muted-foreground">{sale.customerPhone}</p>}
                {sale.paymentMode && <p className="text-muted-foreground">Mode: {sale.paymentMode.replace("_", " ")}</p>}
              </div>
            </div>

            {/* Payment history */}
            <div className="space-y-2">
              <p className="text-body font-medium">Payment History</p>
              {payments.length > 0 ? (
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Date</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Mode</TH>
                        <TH>Reference</TH>
                        <TH>Status</TH>
                        <TH></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {payments.map((p) => (
                        <TR key={p.id}>
                          <TD>{formatDate(p.paymentDate)}</TD>
                          <TD className="tnum text-right font-medium">{formatCurrency(p.amount)}</TD>
                          <TD>{p.mode.replace("_", " ")}</TD>
                          <TD className="text-muted-foreground">{p.reference ?? "—"}</TD>
                          <TD>
                            <StatusPill status={p.status} />
                          </TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <a
                                href={`/print/payment-receipt/${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-micro text-muted-foreground hover:text-foreground"
                                title="Print receipt"
                              >
                                <Printer className="h-3 w-3" />
                              </a>
                              <button
                                onClick={() => sendWhatsAppConfirmation(p.id)}
                                className="inline-flex items-center gap-1 text-micro text-muted-foreground hover:text-success"
                                title="Send WhatsApp confirmation"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-body text-muted-foreground">
                  No payments recorded yet.
                </p>
              )}
            </div>

            {/* Notes */}
            {sale.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-body">
                <span className="font-medium">Notes: </span>{sale.notes}
              </div>
            )}
          </div>
        )}
      </Dialog>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} sale={sale} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} sale={sale} />
      <CompleteSaleDialog open={completeOpen} onOpenChange={setCompleteOpen} sale={sale} />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this sale?"
        description={
          sale.depositAmount
            ? "Cancelling will refund the customer deposit and release the asset back to available. This cannot be undone."
            : "Cancelling will release the asset back to available. This cannot be undone."
        }
        confirmLabel="Cancel Sale"
        onConfirm={cancelSale}
      />
    </>
  );
}
