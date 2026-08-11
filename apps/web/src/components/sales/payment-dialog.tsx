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

export function PaymentDialog({
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
  const [form, setForm] = useState({
    amount: "",
    mode: "BANK_TRANSFER",
    reference: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (!sale) return null;

  const balanceDue = sale.balanceDue;
  const amountNum = Number(form.amount) || 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (amountNum > balanceDue) { toast.error(`Amount cannot exceed balance due (${formatCurrency(balanceDue)})`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${sale!.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          mode: form.mode,
          reference: form.reference.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      const remaining = balanceDue - amountNum;
      toast.success("Payment received", {
        description: remaining > 0
          ? `Remaining balance: ${formatCurrency(remaining)}`
          : "Sale fully paid — GL entry posted.",
        action: remaining > 0 ? {
          label: "Record Next Payment",
          onClick: () => router.push(`/sales?sale=${sale!.id}`),
        } : {
          label: "View GL Entry",
          onClick: () => router.push("/gl"),
        },
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
      title="Record Payment"
      description={`${sale.saleNumber} · ${sale.customerName}`}
      className="max-w-md"
    >
      {/* Sale summary */}
      <div className="mb-4 grid grid-cols-4 gap-3 rounded-md border bg-muted/40 p-3 text-body">
        <div>
          <p className="text-caption text-muted-foreground">Sale Price</p>
          <p className="font-medium tnum">{formatCurrency(sale.salePrice)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">GST</p>
          <p className="font-medium tnum">{formatCurrency(sale.gstAmount ?? 0)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Total Paid</p>
          <p className="font-medium tnum">{formatCurrency(sale.totalPaid)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Balance Due</p>
          <p className="font-medium text-warning tnum">{formatCurrency(sale.balanceDue)}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-amount">Amount *</Label>
          <Input
            id="p-amount"
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
          <Label htmlFor="p-mode">Mode</Label>
          <Select id="p-mode" value={form.mode} onChange={(e) => set("mode", e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace("_", " ")}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-ref">Reference</Label>
          <Input id="p-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Cheque no, UTR, etc." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || amountNum <= 0 || amountNum > balanceDue}>
            {saving ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
