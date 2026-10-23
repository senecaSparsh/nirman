"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { MobileChequeFields, EMPTY_MOBILE_CHEQUE, type MobileChequeState } from "../sales/MobileChequeFields";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

const PAYMENT_MODES = ["CASH", "BANK", "UPI", "CHEQUE"];

const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";

/**
 * Inline "Record Payment" dialog for material sales.
 * Used from the mobile list so the user doesn't have to navigate to the
 * detail page just to record a payment.
 */
export function MobileMaterialSalePaymentDialog({
  open,
  onClose,
  saleId,
  saleNumber,
  totalAmount,
  outstandingBalance,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  saleId: string;
  saleNumber: string;
  totalAmount: number;
  outstandingBalance: number;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("CASH");
  const [payRef, setPayRef] = useState("");
  const [payTds, setPayTds] = useState("");
  const [payTdsSection, setPayTdsSection] = useState("194Q");
  const [payCheque, setPayCheque] = useState<MobileChequeState>(EMPTY_MOBILE_CHEQUE);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const tds = Number(payTds) || 0;
    if (tds < 0 || tds >= amount) {
      toast.error("TDS must be less than the payment amount");
      return;
    }
    if (amount + tds > outstandingBalance) {
      toast.error(`Amount + TDS exceeds outstanding balance of ${formatCurrency(outstandingBalance)}`);
      return;
    }
    if (payMode === "CHEQUE" && !payCheque.chequeNo.trim()) {
      toast.error("Cheque number is required");
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
          ...(Number(payTds) > 0 ? { tdsAmount: Number(payTds), tdsSection: payTdsSection || undefined } : {}),
          ...(payMode === "CHEQUE" ? {
            chequeNo: payCheque.chequeNo.trim() || undefined,
            chequeDate: payCheque.chequeDate || undefined,
            chequeBank: payCheque.chequeBank.trim() || undefined,
            chequePhotoUrl: payCheque.chequePhotoUrl || undefined,
          } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record payment");
      }
      toast.success(payMode === "CHEQUE" ? "Cheque payment recorded (pending clearance)" : "Payment recorded");
      // Reset form
      setPayAmount("");
      setPayRef("");
      setPayCheque(EMPTY_MOBILE_CHEQUE);
      onClose();
      onPaid?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <MobileDialog open={open} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Payment against <span className="font-mono font-bold">{saleNumber}</span>
        </p>

        {outstandingBalance > 0 ? (
          <div className="text-m-caption rounded-[0.375rem] px-2 py-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, transparent)", color: "var(--color-signal-dark)" }}>
            Balance due: <span className="font-bold tabular-nums">{formatCurrency(outstandingBalance)}</span>
          </div>
        ) : null}

        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Payment Details</p>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <div className="flex items-center justify-between mb-0">
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Amount <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              {outstandingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setPayAmount(String(Math.max(0, outstandingBalance - (Number(payTds) || 0))))}
                  className="text-m-caption font-bold press"
                  style={{ color: "var(--color-signal-dark)" }}
                >
                  Pay Full
                </button>
              )}
            </div>
            <input aria-label="Pay Amount"
              type="text"
              inputMode="decimal"
              step="any"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={String(outstandingBalance || totalAmount)}
              className={inputClass}
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
              required
            />
          </div>
            <div className="pl-2">
              <EnumSelect
                label="Payment mode"
                required
                value={payMode}
                onChange={(v) => setPayMode(v)}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Buyer TDS deducted (optional)
            </label>
            <input aria-label="Ay TDS"
              type="text"
              inputMode="decimal"
              value={payTds}
              onChange={(e) => setPayTds(e.target.value)}
              placeholder="0 — only if the buyer deducted TDS"
              className={inputClass}
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
            />
            {Number(payTds) > 0 && (
              <div className="pl-2">
                <EnumSelect
                  label="TDS section"
                  value={payTdsSection}
                  onChange={(v) => setPayTdsSection(v)}
                  options={["194Q", "194C", "other"].map((s) => ({ value: s, label: s === "194Q" ? "194Q (0.1% goods)" : s === "194C" ? "194C (1% works)" : s }))}
                />
              </div>
            )}
            {Number(payTds) > 0 && (
              <p className="text-m-micro mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                Settles {formatCurrency(Number(payAmount) + Number(payTds))} of the sale — receivable for Form 26AS
              </p>
            )}
          </div>
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Reference no (optional)
            </label>
            <input aria-label="UTR / cheque no"
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="UTR / cheque no"
              className={inputClass}
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent" }}
            />
          </div>
          {payMode === "CHEQUE" && <MobileChequeFields value={payCheque} onChange={setPayCheque} />}
        </div>

        {payAmount && Number(payAmount) > 0 && Number(payAmount) <= outstandingBalance ? (
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            After payment{(Number(payTds) || 0) > 0 ? " + TDS" : ""}: <span className="font-bold tabular-nums" style={{ color: "var(--color-go)" }}>{formatCurrency(outstandingBalance - Number(payAmount) - (Number(payTds) || 0))}</span>
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-[0.5rem] border py-2 text-m-body font-bold text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-[0.5rem] py-2 text-m-body font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Record Payment"}
          </button>
        </div>
      </form>
    </MobileDialog>
  );
}