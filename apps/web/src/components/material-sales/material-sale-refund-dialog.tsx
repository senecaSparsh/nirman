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

/**
 * Refund a customer credit — returns on an already-paid sale leave money owed
 * to the customer. Posts Dr AR / Cr Cash via the refund endpoint; the server
 * caps at the refundable credit so it can never over-refund.
 */
export function MaterialSaleRefundDialog({
  open,
  onOpenChange,
  saleId,
  saleNumber,
  refundableCredit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  saleNumber: string;
  refundableCredit: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedAmount = Number(amount) || 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) { toast.error("Refund amount must be greater than 0"); return; }
    if (parsedAmount > refundableCredit) {
      toast.error(`Refund exceeds the refundable credit of ${formatCurrency(refundableCredit)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/material-sales/${saleId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record refund");
      toast.success(`Refunded ${formatCurrency(parsedAmount)} to customer`);
      onOpenChange(false);
      setAmount(""); setReferenceNo(""); setNotes("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to record refund");
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
      title="Refund Customer Credit"
      description={`Sale ${saleNumber} — returns have left ${formatCurrency(refundableCredit)} owed back to the customer`}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Refund Amount" required>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Amount"
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
          <Field label="Payment Mode" required>
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="BANK">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reference No.">
            <Input aria-label="UTR / Transaction ID"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / Transaction ID"
            />
          </Field>
          <Field label="Notes">
            <Input aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Refund for returned material"
            />
          </Field>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
          Refundable credit: <span className="tnum font-medium text-foreground">{formatCurrency(refundableCredit)}</span>
          {parsedAmount > 0 && parsedAmount <= refundableCredit && (
            <span className="ml-2 text-success">→ After refund: {formatCurrency(refundableCredit - parsedAmount)}</span>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Refunding…" : "Refund"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}