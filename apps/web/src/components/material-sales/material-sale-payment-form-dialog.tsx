"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IndianRupee, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { ChequeFields, EMPTY_CHEQUE, type ChequeFormState } from "@/components/sales/cheque-fields";
import { formatCurrency } from "@/lib/utils";
import { useTodayDateState } from "@/lib/use-today-date";
import { required, positiveNumber } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";

type FormState = {
  amount: string;
  paymentDate: string;
  paymentMode: string;
  referenceNo: string;
  notes: string;
};

export function MaterialSalePaymentFormDialog({
  open,
  onOpenChange,
  saleId,
  saleNumber,
  totalAmount,
  outstandingBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  saleNumber: string;
  totalAmount: number;
  outstandingBalance: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useTodayDateState();
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [cheque, setCheque] = useState<ChequeFormState>(EMPTY_CHEQUE);
  const [tdsAmount, setTdsAmount] = useState("");
  const [tdsSection, setTdsSection] = useState("");

  const parsedAmount = Number(amount) || 0;
  const parsedTds = Number(tdsAmount) || 0;
  const settled = parsedAmount + parsedTds;
  const isCheque = paymentMode === "CHEQUE";

  // Customer credits from their other sales — apply them here instead of
  // refunding. Fetched when the dialog opens.
  const [credits, setCredits] = useState<{ saleId: string; saleNumber: string; refundable: number }[]>([]);
  const [applyingSale, setApplyingSale] = useState<string | null>(null);
  useEffect(() => {
    if (!open) { setCredits([]); return; }
    let live = true;
    fetch(`/api/material-sales/${saleId}/apply-credit`)
      .then((r) => (r.ok ? r.json() : { credits: [] }))
      .then((d) => {
        if (!live) return;
        setCredits((d.credits ?? []).map((c: { saleId: string; saleNumber: string; refundable: string }) => ({ ...c, refundable: Number(c.refundable) })));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [open, saleId]);

  async function applyCredit(sourceSaleId: string, refundable: number) {
    const applyAmount = Math.min(refundable, outstandingBalance);
    setApplyingSale(sourceSaleId);
    try {
      const res = await fetch(`/api/material-sales/${saleId}/apply-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSaleId, amount: applyAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply credit");
      toast.success(`Credit applied — ${formatCurrency(applyAmount)}`);
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply credit");
    } finally {
      setApplyingSale(null);
    }
  }

  // ── Inline validation ──────────────────────────────────────────
  // Validates on blur and shows red error text under the field instantly.
  const validationRules: ValidationRules<FormState> = {
    amount: (v) => required(v as string, "Amount") ?? positiveNumber(v as string, "Amount"),
    paymentDate: (v) => required(v as string, "Payment Date"),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll({ amount, paymentDate, paymentMode, referenceNo, notes })) {
      toast.error("Please fix the errors in the form");
      return;
    }
    if (settled > outstandingBalance) {
      toast.error(`Amount + TDS exceeds outstanding balance of ${formatCurrency(outstandingBalance)}`);
      return;
    }
    if (parsedTds > 0 && parsedTds >= parsedAmount) {
      toast.error("TDS cannot meet or exceed the payment amount");
      return;
    }
    if (isCheque && !cheque.chequeNo.trim()) { toast.error("Cheque number is required for cheque payments"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/material-sales/${saleId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          paymentDate,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
          ...(parsedTds > 0 ? { tdsAmount: parsedTds, tdsSection: tdsSection || undefined } : {}),
          ...(isCheque ? {
            chequeNo: cheque.chequeNo.trim() || undefined,
            chequeDate: cheque.chequeDate || undefined,
            chequeBank: cheque.chequeBank.trim() || undefined,
            chequePhotoUrl: cheque.chequePhotoUrl || undefined,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success("Payment recorded successfully");
      onOpenChange(false);
      // Reset form
      setAmount(""); setReferenceNo(""); setNotes("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) { setAmount(""); setReferenceNo(""); setNotes(""); clearAll(); }
      }}
      title="Record Payment"
      description={`Payment against material sale ${saleNumber}`}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount" required error={errors.amount}>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); clearError("amount"); }}
                onBlur={() => onBlur("amount", { amount, paymentDate, paymentMode, referenceNo, notes })}
                aria-invalid={!!errors.amount}
                placeholder="0.00"
                className="pl-8 tnum"
                required
              />
            </div>
          </Field>
          <Field label="Payment Date" required error={errors.paymentDate}>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => { setPaymentDate(e.target.value); clearError("paymentDate"); }}
              onBlur={() => onBlur("paymentDate", { amount, paymentDate, paymentMode, referenceNo, notes })}
              aria-invalid={!!errors.paymentDate}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Payment Mode" required>
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="BANK">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </Field>
          <Field label="Reference No.">
            <Input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / Cheque no / Transaction ID"
            />
          </Field>
        </div>

        <details className="rounded-md border border-border/60 px-3 py-2">
          <summary className="cursor-pointer text-caption text-muted-foreground">Buyer deducted TDS (B2B — 194Q/194C)? Tap to record</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="TDS amount (₹)">
              <Input type="number" step="0.01" min="0" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} placeholder="0.00" className="tnum" />
            </Field>
            <Field label="Section">
              <Select value={tdsSection} onChange={(e) => setTdsSection(e.target.value)}>
                <option value="">—</option>
                <option value="194Q">194Q (0.1% goods)</option>
                <option value="194C">194C (1% works)</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <p className="col-span-2 text-xs text-muted-foreground">TDS settles the receivable and posts to TDS Receivable (1961) — it reconciles in 26AS, not as cash.</p>
          </div>
        </details>

        <Field label="Notes">
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-body outline-none focus:ring-2 focus:ring-ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            rows={2}
          />
        </Field>

        {isCheque && <ChequeFields value={cheque} onChange={setCheque} />}

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
          Sale total: <span className="tnum font-medium text-foreground">{formatCurrency(totalAmount)}</span>
          <span className="ml-2">Outstanding: <span className="tnum font-medium text-foreground">{formatCurrency(outstandingBalance)}</span></span>
          {settled > 0 && settled <= outstandingBalance && (
            <span className="ml-2 text-success">→ After payment{parsedTds > 0 ? " + TDS" : ""}: {formatCurrency(outstandingBalance - settled)}</span>
          )}
        </div>

        {credits.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 space-y-1.5">
            <p className="text-caption font-medium text-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-warning" />
              Customer credit available — settle with credit instead of cash
            </p>
            {credits.map((c) => (
              <div key={c.saleId} className="flex items-center justify-between text-caption">
                <span className="text-muted-foreground">
                  {c.saleNumber} — <span className="tnum font-medium text-foreground">{formatCurrency(c.refundable)}</span> credit
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={applyingSale === c.saleId || outstandingBalance <= 0}
                  onClick={() => applyCredit(c.saleId, c.refundable)}
                >
                  {applyingSale === c.saleId ? "Applying…" : `Apply ${formatCurrency(Math.min(c.refundable, outstandingBalance))}`}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
