"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Banknote, X, Printer, CheckCircle2, HandCoins, MessageCircle, FileText, ExternalLink, CalendarClock, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { PaymentDialog } from "./payment-dialog";
import { DepositDialog } from "./deposit-dialog";
import { CompleteSaleDialog } from "./complete-sale-dialog";
import { EditScheduleDialog } from "./edit-schedule-dialog";
import { EditSaleDialog } from "./edit-sale-dialog";
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
  const [scheduleEditOpen, setScheduleEditOpen] = useState(false);
  const [saleEditOpen, setSaleEditOpen] = useState(false);
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

  // Re-fetch sale detail after a sub-dialog action (payment, deposit, complete)
  // so the dialog stays live instead of going stale.
  function refreshDetail() {
    if (!sale) return;
    fetch(`/api/sales/${sale.id}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setDetail(d); })
      .catch(() => { /* best-effort */ });
  }

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

  // Merge: prefer fresh detail fields (from the GET API) over the stale row
  // prop so the dialog stays live after deposit/payment/complete actions.
  const d: AssetSaleDetail | null = detail;
  const payments = d?.payments ?? [];
  const cur = {
    ...sale,
    status: d?.status ?? sale.status,
    saleStage: d?.saleStage ?? sale.saleStage,
    depositAmount: d?.depositAmount ?? sale.depositAmount,
    depositDate: d?.depositDate ?? sale.depositDate,
    finalSaleDate: d?.finalSaleDate ?? sale.finalSaleDate,
    paymentStatus: d?.paymentStatus ?? sale.paymentStatus,
    totalPaid: d?.totalPaid ?? sale.totalPaid,
    balanceDue: d?.balanceDue ?? sale.balanceDue,
    paymentCount: d?.paymentCount ?? sale.paymentCount,
    saleDeedNo: d?.saleDeedNo ?? sale.saleDeedNo,
  };
  const assetLabel = cur.assetType === "LAND"
    ? `Plot ${cur.landParcelNumber ?? "—"}`
    : `Unit ${cur.builtUnitNumber ?? "—"}${cur.builtUnitType ? ` (${cur.builtUnitType.replace("_", " ")})` : ""}`;

  const saleStage = cur.saleStage ?? (cur.status === "CANCELLED" ? "CANCELLED" : "COMPLETED");
  const isCancelled = cur.status === "CANCELLED";
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
  const canRecordPayment = !isCancelled && cur.balanceDue > 0 && !isPending && canManage;

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
              <StatusPill status={cur.status} />
              <StatusPill status={saleStage} />
              <StatusPill status={cur.paymentStatus} />
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
              {canManage && !isCancelled && (
                <Button size="sm" variant="outline" onClick={() => setSaleEditOpen(true)} disabled={acting}>
                  Edit
                </Button>
              )}
              <a
                href={`/sales/${sale.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
                title="Print sale booking form"
              >
                <Printer className="h-4 w-4" /> Print Form
              </a>
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
                <p className="tnum font-medium text-warning">{formatCurrency(cur.balanceDue)}</p>
              </div>
            </div>

            {/* Deposit info (if deposit received) */}
            {cur.depositAmount != null && cur.depositAmount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <HandCoins className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    Deposit: {formatCurrency(cur.depositAmount)}
                    {cur.depositDate && <span className="ml-2 text-caption text-muted-foreground">on {formatDate(cur.depositDate)}</span>}
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
            {isCompleted && cur.finalSaleDate && (
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft/20 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    Sale completed on {formatDate(cur.finalSaleDate)}
                  </p>
                  {cur.saleDeedNo ? (
                    <p className="text-caption text-muted-foreground">Sale Deed No: <strong className="text-foreground">{cur.saleDeedNo}</strong> · Revenue + COGS recognised. Title transferred.</p>
                  ) : (
                    <p className="text-caption text-muted-foreground">Revenue + COGS recognised. Title transferred.</p>
                  )}
                </div>
              </div>
            )}

            {/* ATS / expected registry info */}
            {!isCompleted && !isCancelled && sale.expectedRegistryDate && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <FileText className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    ATS — registry expected by {formatDate(sale.expectedRegistryDate)}
                  </p>
                  <p className="text-caption text-muted-foreground">Booking recorded. Complete the sale when the sale deed is registered.</p>
                </div>
              </div>
            )}

            {/* Compliance documents */}
            {(sale.allotmentLetterNo || sale.bbaNo || sale.tdsAmount != null || sale.homeLoanBank) && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-label text-muted-foreground">Compliance Documents</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption">
                  {sale.allotmentLetterNo && (
                    <div><span className="text-muted-foreground">Allotment Letter:</span> <strong className="text-foreground">{sale.allotmentLetterNo}</strong>{sale.allotmentDate ? ` · ${formatDate(sale.allotmentDate)}` : ""}</div>
                  )}
                  {sale.bbaNo && (
                    <div><span className="text-muted-foreground">BBA:</span> <strong className="text-foreground">{sale.bbaNo}</strong>{sale.bbaDate ? ` · ${formatDate(sale.bbaDate)}` : ""}</div>
                  )}
                  {sale.tdsAmount != null && (
                    <div><span className="text-muted-foreground">TDS:</span> <strong className="text-foreground tnum">{formatCurrency(sale.tdsAmount)}</strong>{sale.tdsCertificateNo ? ` · ${sale.tdsCertificateNo}` : ""}</div>
                  )}
                  {sale.homeLoanBank && (
                    <div><span className="text-muted-foreground">Home Loan:</span> <strong className="text-foreground">{sale.homeLoanBank}</strong>{sale.homeLoanAmount ? ` · ${formatCurrency(sale.homeLoanAmount)}` : ""}</div>
                  )}
                </div>
              </div>
            )}

            {/* Deal terms */}
            {(sale.dealMaturityMonths || sale.paymentCycle) && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-label text-muted-foreground">Deal Terms</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption">
                  {sale.dealMaturityMonths && (
                    <div><span className="text-muted-foreground">Maturity:</span> <strong className="text-foreground">{sale.dealMaturityMonths} months</strong>{sale.dealMaturityDate ? ` · by ${formatDate(sale.dealMaturityDate)}` : ""}</div>
                  )}
                  {sale.paymentCycle && (
                    <div><span className="text-muted-foreground">Cycle:</span> <strong className="text-foreground">{sale.paymentCycle}</strong></div>
                  )}
                </div>
              </div>
            )}

            {/* Broker / deal source */}
            {sale.dealSource === "BROKER" && (sale.brokerName || sale.brokerAgency) && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-label text-muted-foreground">Broker Details</p>
                  {sale.commissionAmount != null && !sale.commissionPaid && canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/sales/${sale.id}/pay-commission`, { method: "POST" });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error ?? "Failed to pay commission");
                          toast.success("Broker commission paid");
                          router.refresh();
                          onOpenChange(false);
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : "Failed to pay commission");
                        }
                      }}
                    >
                      <Banknote className="h-3.5 w-3.5" /> Pay Commission
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption">
                  <div><span className="text-muted-foreground">Name:</span> <strong className="text-foreground">{sale.brokerName ?? "—"}</strong></div>
                  {sale.brokerPhone && <div><span className="text-muted-foreground">Phone:</span> <strong className="text-foreground">{sale.brokerPhone}</strong></div>}
                  {sale.brokerAgency && <div><span className="text-muted-foreground">Agency:</span> <strong className="text-foreground">{sale.brokerAgency}</strong></div>}
                  {sale.commissionAmount != null && (
                    <div>
                      <span className="text-muted-foreground">Commission:</span> <strong className="text-foreground tnum">{formatCurrency(sale.commissionAmount)}</strong>
                      {sale.commissionIsPartOfDeal && <span className="ml-1 text-muted-foreground">(in deal)</span>}
                      <span className={`ml-2 ${sale.commissionPaid ? "text-success" : "text-warning"}`}>
                        {sale.commissionPaid ? "✓ Paid" : "⏳ Pending"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sale expenses */}
            {sale.expenses && sale.expenses.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-label text-muted-foreground">Expense Heads</p>
                <div className="rounded-md border border-border/40">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Head</TH>
                        <TH>Borne By</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Included?</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sale.expenses.map((e) => (
                        <TR key={e.id}>
                          <TD>{e.label ?? e.head.replace(/_/g, " ")}</TD>
                          <TD>{e.borneBy === "CLIENT" ? "Client" : e.borneBy === "SELLER" ? "Seller" : "N/A"}</TD>
                          <TD className="tnum text-right">{formatCurrency(e.amount)}</TD>
                          <TD className="text-caption">{e.isIncluded ? "Yes" : "Extra"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Terms & conditions */}
            {sale.terms && sale.terms.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-label text-muted-foreground">Terms &amp; Conditions</p>
                <ol className="list-decimal space-y-1 pl-5 text-caption">
                  {sale.terms.map((t) => (
                    <li key={t.id}>
                      {t.description}
                      {t.extraAmount != null && !t.isIncluded && (
                        <span className="ml-2 text-muted-foreground">(Extra: {formatCurrency(t.extraAmount)})</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Payment schedule */}
            {sale.paymentSchedule && sale.paymentSchedule.items.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-label text-muted-foreground">Payment Schedule ({sale.paymentSchedule.type})</p>
                  {canManage && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => setScheduleEditOpen(true)}
                      className="text-caption text-muted-foreground hover:text-brand transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {/* Next-due installment banner — surfaces the most actionable
                    schedule item so the sales manager doesn't have to scan the
                    full table to find what's due next. */}
                {(() => {
                  const now = new Date();
                  const nextDue = sale.paymentSchedule!.items
                    .filter((item) => item.status !== "PAID" && item.dueDate)
                    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];
                  if (!nextDue) return null;
                  const dueDate = new Date(nextDue.dueDate!);
                  const isOverdue = dueDate < now;
                  return (
                    <div className={`flex items-center gap-3 rounded-md border p-2.5 ${isOverdue ? "border-danger/30 bg-danger-soft/20" : "border-info/30 bg-info-soft/20"}`}>
                      {isOverdue ? <AlertCircle className="h-4 w-4 shrink-0 text-danger" /> : <CalendarClock className="h-4 w-4 shrink-0 text-info" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-medium text-foreground">
                          {isOverdue ? "Overdue: " : "Next due: "}{nextDue.description}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {formatCurrency(nextDue.amount)} · due {formatDate(nextDue.dueDate!)}
                          {isOverdue && ` · ${Math.ceil((now.getTime() - dueDate.getTime()) / 86400000)} day(s) late`}
                        </p>
                      </div>
                      {canManage && !isCancelled && (
                        <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} disabled={acting}>
                          <Banknote className="h-3.5 w-3.5" /> Collect
                        </Button>
                      )}
                    </div>
                  );
                })()}
                <div className="rounded-md border border-border/40">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>#</TH>
                        <TH>Description</TH>
                        <TH className="text-right">%</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Due Date</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sale.paymentSchedule.items.map((item) => (
                        <TR key={item.installmentNo}>
                          <TD className="tnum">{item.installmentNo}</TD>
                          <TD>{item.description}</TD>
                          <TD className="tnum text-right">{item.percentage}%</TD>
                          <TD className="tnum text-right">{formatCurrency(item.amount)}</TD>
                          <TD className="text-caption">{item.dueDate ? formatDate(item.dueDate) : "—"}</TD>
                          <TD><StatusPill status={item.status} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Payment progress + next step */}
            {!isCancelled && cur.balanceDue > 0 && !isPending && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <Banknote className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">
                    {formatCurrency(cur.totalPaid)} paid · {formatCurrency(cur.balanceDue)} remaining
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {cur.paymentCount} payment{cur.paymentCount !== 1 ? "s" : ""} recorded so far
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
                <p className="font-medium">
                  {sale.builtUnitId ? (
                    <Link href={`/units?unit=${sale.builtUnitId}`} onClick={() => onOpenChange(false)} className="text-foreground hover:text-brand hover:underline inline-flex items-center gap-1">
                      {assetLabel}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                  ) : sale.landParcelId ? (
                    <Link href={`/land`} onClick={() => onOpenChange(false)} className="text-foreground hover:text-brand hover:underline inline-flex items-center gap-1">
                      {assetLabel}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                  ) : (
                    assetLabel
                  )}
                </p>
                {sale.assetArea != null && (
                  <p className="tnum text-muted-foreground">{formatNumber(sale.assetArea)} {sale.assetAreaUnit ?? ""}</p>
                )}
                <p className="text-muted-foreground">{sale.projectName}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 text-body">
                <p className="mb-1 text-caption font-medium text-muted-foreground">Customer</p>
                <p className="font-medium">
                  <Link href={`/sales?tab=customers`} onClick={() => onOpenChange(false)} className="text-foreground hover:text-brand hover:underline inline-flex items-center gap-1">
                    {sale.customerName}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                </p>
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

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} sale={sale} onSuccess={refreshDetail} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} sale={sale} onSuccess={refreshDetail} />
      <CompleteSaleDialog open={completeOpen} onOpenChange={setCompleteOpen} sale={sale} onSuccess={refreshDetail} />
      <EditScheduleDialog open={scheduleEditOpen} onOpenChange={setScheduleEditOpen} sale={sale} onSuccess={refreshDetail} />
      <EditSaleDialog open={saleEditOpen} onOpenChange={setSaleEditOpen} sale={sale} onSuccess={refreshDetail} />

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
