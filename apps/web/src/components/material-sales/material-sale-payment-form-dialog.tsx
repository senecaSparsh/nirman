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
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedAmount = Number(amount) || 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (parsedAmount > outstandingBalance) {
      toast.error(`Amount exceeds outstanding balance of ${formatCurrency(outstandingBalance)}`);
      return;
    }
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
        if (!o) { setAmount(""); setReferenceNo(""); setNotes(""); }
      }}
      title="Record Payment"
      description={`Payment against material sale ${saleNumber}`}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount" required>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-8 tnum"
                required
              />
            </div>
          </Field>
          <Field label="Payment Date" required>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
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

        <Field label="Notes">
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-body outline-none focus:ring-2 focus:ring-ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            rows={2}
          />
        </Field>

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
          Sale total: <span className="tnum font-medium text-foreground">{formatCurrency(totalAmount)}</span>
          <span className="ml-2">Outstanding: <span className="tnum font-medium text-foreground">{formatCurrency(outstandingBalance)}</span></span>
          {parsedAmount > 0 && parsedAmount <= outstandingBalance && (
            <span className="ml-2 text-success">→ After payment: {formatCurrency(outstandingBalance - parsedAmount)}</span>
          )}
        </div>

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
