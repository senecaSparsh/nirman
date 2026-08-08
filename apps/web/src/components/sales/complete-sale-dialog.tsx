"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { AssetSaleRow } from "@/lib/types";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

export function CompleteSaleDialog({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const remainingBalance = sale ? sale.salePrice - (sale.totalPaid ?? 0) : 0;
  const [form, setForm] = useState({
    finalPaymentAmount: "",
    paymentMode: "BANK_TRANSFER",
    reference: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (!sale) return null;

  // Default the final payment to the remaining balance
  const amountNum = form.finalPaymentAmount ? Number(form.finalPaymentAmount) : remainingBalance;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${sale!.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          finalPaymentAmount: amountNum > 0 ? amountNum : undefined,
          paymentMode: form.paymentMode,
          reference: form.reference.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete sale");
      toast.success("Sale completed", {
        description: "Revenue + COGS recognised. Asset marked SOLD.",
        action: { label: "View GL", onClick: () => router.push("/gl") },
      });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complete Sale"
      description={`${sale.saleNumber} · ${sale.customerName}`}
      className="max-w-md"
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-body">
        <div>
          <p className="text-caption text-muted-foreground">Sale Price</p>
          <p className="font-medium tnum">{formatCurrency(sale.salePrice)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Deposit Paid</p>
          <p className="font-medium tnum">{formatCurrency(sale.depositAmount ?? sale.totalPaid)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Remaining</p>
          <p className="font-medium text-warning tnum">{formatCurrency(remainingBalance)}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-amount">Final Payment Amount</Label>
          <Input
            id="c-amount"
            type="number"
            min="0"
            step="0.01"
            value={form.finalPaymentAmount || String(remainingBalance)}
            onChange={(e) => set("finalPaymentAmount", e.target.value)}
            placeholder={String(remainingBalance)}
          />
          <p className="text-caption text-muted-foreground">
            Defaults to the remaining balance of {formatCurrency(remainingBalance)}. Set 0 if already collected.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-mode">Payment Mode</Label>
          <Select id="c-mode" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace("_", " ")}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-ref">Reference</Label>
          <Input id="c-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Cheque no, UTR, etc." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Completing…" : "Complete Sale"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
