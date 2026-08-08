"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IndianRupee } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { formatCurrency } from "@/lib/utils";
import { required, positiveNumber, type ValidationErrors } from "@/lib/validate";
import type { SupplierRow } from "@/lib/types";

type PaymentFormValues = {
  supplierId: string;
  amount: string;
  paymentMode: string;
  paymentDate: string;
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export function SupplierPaymentFormDialog({
  open,
  onOpenChange,
  suppliers,
  purchaseOrderId,
  purchaseOrderNumber,
  defaultSupplierId,
  defaultAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierRow[];
  /** If set, the payment is linked to this PO and supplier is locked. */
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  defaultSupplierId?: string;
  defaultAmount?: number;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [tdsAmount, setTdsAmount] = useState("");
  const [tdsSection, setTdsSection] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors<PaymentFormValues>>({});

  function validateField(key: keyof PaymentFormValues): string | undefined {
    const values: PaymentFormValues = { supplierId, amount, paymentMode, paymentDate };
    const rules: Partial<Record<keyof PaymentFormValues, (v: string) => string | undefined>> = {
      supplierId: (v) => required(v, "Supplier"),
      amount: (v) => required(v, "Amount") ?? positiveNumber(v, "Amount"),
      paymentMode: (v) => required(v, "Payment mode"),
      paymentDate: (v) => required(v, "Payment date"),
    };
    const rule = rules[key];
    return rule ? rule(values[key]) : undefined;
  }

  function onBlur(key: keyof PaymentFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const parsedAmount = Number(amount) || 0;
  const parsedTds = Number(tdsAmount) || 0;
  const netPaid = parsedAmount - parsedTds;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<PaymentFormValues> = {};
    (["supplierId", "amount", "paymentMode", "paymentDate"] as (keyof PaymentFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          purchaseOrderId: purchaseOrderId ?? undefined,
          amount: parsedAmount,
          tdsAmount: parsedTds > 0 ? parsedTds : undefined,
          tdsSection: tdsSection || undefined,
          paymentDate,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success(`Payment ${data.paymentNumber} recorded`);
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
        if (!o) { setAmount(""); setReferenceNo(""); setNotes(""); setErrors({}); }
      }}
      title="Record Supplier Payment"
      description={
        purchaseOrderNumber
          ? `Payment against PO ${purchaseOrderNumber}`
          : "Record a payment made to a supplier. This reduces Accounts Payable and Cash."
      }
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Supplier" required error={errors.supplierId}>
          <Select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            onBlur={() => onBlur("supplierId")}
            disabled={!!purchaseOrderId}
            required
            aria-invalid={!!errors.supplierId}
            className={errors.supplierId ? errorBorder : undefined}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.balanceOwed > 0 ? ` (Owes: ${formatCurrency(s.balanceOwed)})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount" required error={errors.amount}>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => onBlur("amount")}
                placeholder="0.00"
                className={`pl-8 tnum ${errors.amount ? errorBorder : ""}`}
                required
                aria-invalid={!!errors.amount}
              />
            </div>
          </Field>
          <Field label="Payment Date" required error={errors.paymentDate}>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              onBlur={() => onBlur("paymentDate")}
              required
              aria-invalid={!!errors.paymentDate}
              className={errors.paymentDate ? errorBorder : undefined}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Payment Mode" required error={errors.paymentMode}>
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} onBlur={() => onBlur("paymentMode")} aria-invalid={!!errors.paymentMode} className={errors.paymentMode ? errorBorder : undefined}>
              <option value="BANK">Bank Transfer</option>
              <option value="NEFT">NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
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

        {/* TDS Section */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
          <p className="text-label font-medium text-muted-foreground">TDS Deduction (optional)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="TDS Amount">
              <div className="relative">
                <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tdsAmount}
                  onChange={(e) => setTdsAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-8 tnum"
                />
              </div>
            </Field>
            <Field label="TDS Section">
              <Select value={tdsSection} onChange={(e) => setTdsSection(e.target.value)}>
                <option value="">Select section…</option>
                <option value="194C">194C — Contract</option>
                <option value="194I">194I — Rent</option>
                <option value="194J">194J — Professional</option>
                <option value="194Q">194Q — Purchase of Goods</option>
                <option value="194H">194H — Commission</option>
              </Select>
            </Field>
          </div>
        </div>

        <Field label="Notes">
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-body outline-none focus:ring-2 focus:ring-ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            rows={2}
          />
        </Field>

        {selectedSupplier && selectedSupplier.balanceOwed > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
            Current outstanding: <span className="tnum font-medium text-foreground">{formatCurrency(selectedSupplier.balanceOwed)}</span>
            {parsedAmount > 0 && parsedAmount <= selectedSupplier.balanceOwed && (
              <span className="ml-2 text-success">→ After payment: {formatCurrency(selectedSupplier.balanceOwed - parsedAmount)}</span>
            )}
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
