"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Printer, XCircle, Banknote,
  TrendingUp, Loader2, X, IndianRupee,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";

type SaleStatus = "ACTIVE" | "CANCELLED";
type PaymentStatus = "PENDING" | "PARTIAL" | "PAID";

type LineItem = {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  locationId: string;
  locationName: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  gstRate: number;
  gstAmount: number;
  lineTotal: number;
};

type PaymentItem = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  referenceNo: string | null;
};

const PAYMENT_MODES = ["CASH", "BANK", "UPI", "CHEQUE"];

/**
 * Material sale detail — invoice header + financial summary + line items
 * + payment history + cancel/print actions.
 */
export function MobileMaterialSaleDetailClient({
  saleId,
  saleNumber,
  status,
  paymentStatus,
  saleDate,
  subtotal,
  gstTotal,
  totalAmount,
  totalCost,
  grossProfit,
  scrapSubtotal,
  paymentMode,
  notes,
  customer,
  project,
  lines,
  payments,
  canManage,
  notFound,
}: {
  saleId: string;
  saleNumber: string;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  saleDate: string;
  subtotal: number;
  gstTotal: number;
  totalAmount: number;
  totalCost: number;
  grossProfit: number;
  scrapSubtotal: number;
  paymentMode: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  project: { id: string; name: string } | null;
  lines: LineItem[];
  payments: PaymentItem[];
  canManage: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("CASH");
  const [payRef, setPayRef] = useState("");

  if (notFound) {
    return (
      <div>
        <div className="mb-4">
          <MobileBackButton fallback="/m/material-sales" className="" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <IndianRupee className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Sale not found
          </p>
        </div>
      </div>
    );
  }

  const isCancelled = status === "CANCELLED";
  const isPending = paymentStatus === "PENDING" && !isCancelled;
  const isPaid = paymentStatus === "PAID" && !isCancelled;
  const isPartial = paymentStatus === "PARTIAL" && !isCancelled;

  const accentColor = isCancelled
    ? "var(--color-stop)"
    : isPending || isPartial
      ? "var(--color-signal)"
      : "var(--color-go)";

  const statusLabel = isCancelled ? "Cancelled" : isPartial ? "Partial" : isPending ? "Unpaid" : "Paid";
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balanceDue = Math.max(0, totalAmount - totalPaid);

  async function handleCancel() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/material-sales/${saleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to cancel sale");
      }
      toast.success(`Sale ${saleNumber} cancelled`);
      setShowCancel(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel sale");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/material-sales/${saleId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          paymentMode: payMode,
          referenceNo: payRef || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record payment");
      }
      toast.success("Payment recorded");
      setShowPayment(false);
      setPayAmount("");
      setPayRef("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <MobileBackButton fallback="/m/material-sales" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
            {saleNumber}
          </p>
        </div>
        <span
          className="text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{
            color: accentColor,
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* ── Total banner ── */}
      <div
        className="rounded-[0.5rem] border px-3 py-2.5 mb-2"
        style={{
          borderColor: isCancelled
            ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))"
            : "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
          backgroundColor: isCancelled
            ? "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))"
            : "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {isCancelled ? "Cancelled" : isPaid ? "Total Amount" : "Balance Due"}
            </p>
            <p
              className="text-[1rem] font-bold tabular-nums"
              style={{ color: isCancelled ? "var(--color-stop)" : isPaid ? "var(--color-go)" : "var(--color-signal)" }}
            >
              {formatCurrency(isCancelled ? totalAmount : isPaid ? totalAmount : balanceDue)}
            </p>
          </div>
          {!isCancelled && !isPaid ? (
            <div className="text-right">
              <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Total
              </p>
              <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrency(totalAmount)}
              </p>
            </div>
          ) : null}
        </div>
        {!isCancelled && payments.length > 0 ? (
          <div className="mt-1.5 pt-1.5 flex items-center justify-between text-[0.5rem]" style={{ borderTop: "1px solid var(--color-line)" }}>
            <span style={{ color: "var(--color-ink-500)" }}>Paid so far</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalPaid)}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {customer?.phone ? (
          <a
            href={`tel:${customer.phone}`}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Call</span>
          </a>
        ) : (
          <div
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", opacity: 0.5 }}
          >
            <Phone className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-300)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-300)" }}>No phone</span>
          </div>
        )}
        {canManage && !isCancelled && !isPaid ? (
          <button
            onClick={() => setShowPayment(true)}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Banknote className="size-3.5 mb-0.5" style={{ color: "var(--color-go)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Payment</span>
          </button>
        ) : (
          <Link
            href={`/print/material-sale/${saleId}`}
            className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <Printer className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Print</span>
          </Link>
        )}
        <Link
          href={`/print/material-sale/${saleId}`}
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Printer className="size-3.5 mb-0.5" style={{ color: "var(--color-ink-700)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Invoice</span>
        </Link>
      </div>

      {/* ── Info row ── */}
      <div
        className="rounded-[0.5rem] border overflow-hidden mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {customer ? (
          <Link
            href={`/m/customers/${customer.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 press"
          >
            <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Customer
            </span>
            <span className="text-[0.625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {customer.name}
            </span>
          </Link>
        ) : null}

        <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
          <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
            Date
          </span>
          <span className="text-[0.625rem] font-bold ml-auto tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(saleDate)}
          </span>
        </div>

        {project ? (
          <Link
            href={`/m/projects/${project.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 press"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Project
            </span>
            <span className="text-[0.625rem] font-bold ml-auto truncate" style={{ color: "var(--color-ink-950)" }}>
              {project.name}
            </span>
          </Link>
        ) : null}

        {paymentMode ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <span className="text-[0.5rem] font-semibold uppercase shrink-0" style={{ color: "var(--color-ink-500)" }}>
              Pay Mode
            </span>
            <span className="text-[0.625rem] font-bold ml-auto" style={{ color: "var(--color-ink-950)" }}>
              {paymentMode}
            </span>
          </div>
        ) : null}

        {notes ? (
          <div className="px-2.5 py-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <p className="text-[0.5rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>
              Notes
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>{notes}</p>
          </div>
        ) : null}
      </div>

      {/* ── Financial summary ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Subtotal
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(subtotal)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            GST
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(gstTotal)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Cost
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
            {formatCurrencyCompact(totalCost)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Profit
          </p>
          <p
            className="text-[0.875rem] font-bold tabular-nums flex items-center gap-0.5 justify-end"
            style={{ color: grossProfit >= 0 ? "var(--color-go)" : "var(--color-stop)" }}
          >
            <TrendingUp className="size-2.5" />
            {formatCurrencyCompact(grossProfit)}
          </p>
        </div>
      </div>

      {/* Scrap recovery indicator */}
      {scrapSubtotal > 0 ? (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-1.5 mb-3"
          style={{
            borderColor: "color-mix(in srgb, var(--color-steel) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-steel) 6%, var(--color-paper))",
          }}
        >
          <span className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-steel)" }}>
            Scrap Recovery
          </span>
          <span className="text-[0.625rem] font-bold tabular-nums ml-auto" style={{ color: "var(--color-steel)" }}>
            {formatCurrency(scrapSubtotal)}
          </span>
        </div>
      ) : null}

      {/* ── Line items ── */}
      <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
        Line Items ({lines.length})
      </p>
      {lines.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center mb-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <IndianRupee className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>No line items</p>
        </div>
      ) : (
        <div
          className="rounded-[0.5rem] border overflow-hidden mb-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {lines.map((l, i) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.materialId}`}
              className="flex items-center gap-2 px-2.5 py-2 press"
              style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {l.materialName}
                </p>
                <p className="text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                  {l.materialCode} · {l.locationName} · {formatCurrency(l.unitPrice)}/{l.materialUnit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(l.qty, 0)} {l.materialUnit}
                </p>
                <p className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(l.lineTotal)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Payment history ── */}
      {payments.length > 0 ? (
        <>
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
            Payments ({payments.length})
          </p>
          <div
            className="rounded-[0.5rem] border overflow-hidden mb-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {payments.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2.5 py-2"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <span
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
                >
                  <Banknote className="size-3" style={{ color: "var(--color-go)" }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {p.paymentMode}
                    {p.referenceNo ? ` · ${p.referenceNo}` : ""}
                  </p>
                  <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                    {formatDate(p.paymentDate)}
                  </p>
                </div>
                <p className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(p.amount)}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Cancel action ── */}
      {canManage && !isCancelled ? (
        <button
          onClick={() => setShowCancel(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 press"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
        >
          <XCircle className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Cancel Sale</span>
        </button>
      ) : null}

      {/* ── Cancel confirmation modal ── */}
      {showCancel ? (
        <Modal onClose={() => setShowCancel(false)} title="Cancel Sale?">
          <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-700)" }}>
            Cancel sale <span className="font-mono font-bold">{saleNumber}</span>? Stock will be reversed. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancel(false)}
              className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              Keep Sale
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Cancel Sale"}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* ── Payment modal ── */}
      {showPayment ? (
        <Modal onClose={() => setShowPayment(false)} title="Record Payment">
          <form onSubmit={handlePayment} className="flex flex-col gap-3">
            {balanceDue > 0 ? (
              <div className="text-[0.5625rem] rounded-[0.375rem] px-2 py-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, transparent)", color: "var(--color-signal)" }}>
                Balance due: <span className="font-bold tabular-nums">{formatCurrency(balanceDue)}</span>
              </div>
            ) : null}
            <FormField label="Amount" required>
              <input
                type="number"
                step="any"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={String(balanceDue || totalAmount)}
                className={inputClass}
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                required
              />
            </FormField>
            <FormField label="Payment mode" required>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
                className={inputClass}
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </FormField>
            <FormField label="Reference no (optional)">
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="UTR / cheque no"
                className={inputClass}
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              />
            </FormField>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="flex-1 rounded-[0.5rem] border py-2 text-[0.6875rem] font-bold press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

/* ─── Modal ─── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] border p-4 pb-6"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Form field ─── */
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";
