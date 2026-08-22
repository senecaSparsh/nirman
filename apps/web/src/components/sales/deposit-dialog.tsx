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

export function DepositDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    depositAmount: "",
    paymentMode: "BANK_TRANSFER",
    reference: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (!sale) return null;

  const amountNum = Number(form.depositAmount) || 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountNum <= 0) { toast.error("Deposit amount must be greater than 0"); return; }
    const maxAmount = sale!.salePrice + (sale!.gstAmount ?? 0);
    if (amountNum > maxAmount) { toast.error(`Deposit cannot exceed total (${formatCurrency(maxAmount)})`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${sale!.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          depositAmount: amountNum,
          paymentMode: form.paymentMode,
          reference: form.reference.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record deposit");
      toast.success("Deposit received", {
        description: `${formatCurrency(amountNum)} recorded as liability. Asset reserved.`,
      });
      onOpenChange(false);
      onSuccess?.();
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
      title="Record Deposit"
      description={`${sale.saleNumber} · ${sale.customerName}`}
      className="max-w-md"
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-body">
        <div>
          <p className="text-caption text-muted-foreground">Sale Price</p>
          <p className="font-medium tnum">{formatCurrency(sale.salePrice)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">GST</p>
          <p className="font-medium tnum">{formatCurrency(sale.gstAmount ?? 0)}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Existing Deposit</p>
          <p className="font-medium tnum">{formatCurrency(sale.depositAmount ?? 0)}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="d-amount">Deposit Amount *</Label>
          <Input
            id="d-amount"
            type="number"
            min="0"
            max={sale.salePrice + (sale.gstAmount ?? 0)}
            step="0.01"
            value={form.depositAmount}
            onChange={(e) => set("depositAmount", e.target.value)}
            placeholder={`Max ${formatCurrency(sale.salePrice + (sale.gstAmount ?? 0))}`}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-mode">Mode</Label>
          <Select id="d-mode" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace("_", " ")}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-ref">Reference</Label>
          <Input id="d-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Cheque no, UTR, etc." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || amountNum <= 0 || amountNum > (sale.salePrice + (sale.gstAmount ?? 0))}>
            {saving ? "Recording…" : "Record Deposit"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
