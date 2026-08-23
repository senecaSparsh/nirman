"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChequeFields, EMPTY_CHEQUE, type ChequeFormState } from "@/components/sales/cheque-fields";
import { formatCurrency } from "@/lib/utils";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

/**
 * LandPurchasePaymentDialog — record a payment against a land purchase.
 */
export function LandPurchasePaymentDialog({
  open,
  onOpenChange,
  landPurchaseId,
  totalCost,
  totalPaid,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  landPurchaseId: string;
  totalCost: number;
  totalPaid: number;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    paymentMode: "BANK_TRANSFER",
    referenceNo: "",
    notes: "",
  });
  const [cheque, setCheque] = useState<ChequeFormState>(EMPTY_CHEQUE);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const balanceDue = totalCost - totalPaid;
  const amountNum = Number(form.amount) || 0;
  const isCheque = form.paymentMode === "CHEQUE";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (amountNum > balanceDue) { toast.error(`Amount cannot exceed balance due (${formatCurrency(balanceDue)})`); return; }
    if (isCheque && !cheque.chequeNo.trim()) { toast.error("Cheque number is required for cheque payments"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/land-purchases/${landPurchaseId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          paymentMode: form.paymentMode,
          referenceNo: form.referenceNo.trim() || undefined,
          notes: form.notes.trim() || undefined,
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
      const remaining = balanceDue - amountNum;
      toast.success(isCheque ? "Cheque payment recorded (pending clearance)" : "Payment recorded", {
        description: isCheque
          ? "Cheque must be cleared before the purchase is fully paid."
          : remaining > 0 ? `Remaining balance: ${formatCurrency(remaining)}` : "Land purchase fully paid.",
      });
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record Land Purchase Payment"
      className="max-w-md"
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-body">
        <div>
          <p className="text-caption text-muted-foreground">Total Cost</p>
          <p className="font-medium tnum">{formatCurrency(totalCost)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Total Paid</p>
          <p className="font-medium tnum">{formatCurrency(totalPaid)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Balance Due</p>
          <p className="font-medium text-warning tnum">{formatCurrency(balanceDue)}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lpp-amount">Amount *</Label>
          <Input
            id="lpp-amount"
            type="number"
            min="0"
            max={balanceDue}
            step="0.01"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder={`Max ${formatCurrency(balanceDue)}`}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lpp-mode">Mode</Label>
          <Select id="lpp-mode" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
            {PAYMENT_MODES.map((m) => (<option key={m} value={m}>{m.replace("_", " ")}</option>))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lpp-ref">Reference No.</Label>
          <Input id="lpp-ref" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} placeholder="UTR / Cheque no / Transaction ID" />
        </div>
        {isCheque && <ChequeFields value={cheque} onChange={setCheque} />}
        <div className="space-y-1.5">
          <Label htmlFor="lpp-notes">Notes</Label>
          <Textarea id="lpp-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" rows={2} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || amountNum <= 0 || amountNum > balanceDue}>
            {saving ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
