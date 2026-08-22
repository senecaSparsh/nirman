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
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const remainingBalance = sale ? (sale.salePrice + (sale.gstAmount ?? 0)) - (sale.totalPaid ?? 0) : 0;
  const [form, setForm] = useState({
    finalPaymentAmount: "",
    paymentMode: "BANK_TRANSFER",
    reference: "",
    saleDeedNo: "",
    // Compliance fields
    allotmentLetterNo: "",
    allotmentDate: "",
    bbaNo: "",
    bbaDate: "",
    tdsAmount: "",
    tdsCertificateNo: "",
    // Home loan fields
    homeLoanBank: "",
    homeLoanAmount: "",
    homeLoanSanctionNo: "",
    homeLoanSanctionDate: "",
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
          saleDeedNo: form.saleDeedNo.trim() || null,
          // Compliance fields
          allotmentLetterNo: form.allotmentLetterNo.trim() || null,
          allotmentDate: form.allotmentDate || null,
          bbaNo: form.bbaNo.trim() || null,
          bbaDate: form.bbaDate || null,
          tdsAmount: form.tdsAmount ? Number(form.tdsAmount) : undefined,
          tdsCertificateNo: form.tdsCertificateNo.trim() || null,
          // Home loan details
          homeLoanBank: form.homeLoanBank.trim() || null,
          homeLoanAmount: form.homeLoanAmount ? Number(form.homeLoanAmount) : undefined,
          homeLoanSanctionNo: form.homeLoanSanctionNo.trim() || null,
          homeLoanSanctionDate: form.homeLoanSanctionDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete sale");
      toast.success("Sale completed", {
        description: "Revenue + COGS recognised. Asset marked SOLD.",
        action: { label: "View GL", onClick: () => router.push("/gl") },
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
      title="Complete Sale"
      description={`${sale.saleNumber} · ${sale.customerName}`}
      className="max-w-md"
    >
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
        <div className="space-y-1.5">
          <Label htmlFor="c-deed">Sale Deed / Registry No.</Label>
          <Input id="c-deed" value={form.saleDeedNo} onChange={(e) => set("saleDeedNo", e.target.value)} placeholder="e.g. SR-1234/2025" />
          <p className="text-caption text-muted-foreground">
            The registered sale deed number from the sub-registrar. Captured at completion when the title is transferred.
          </p>
        </div>

        {/* ── Compliance documents ── */}
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="text-body font-semibold">Compliance Documents</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-allot-no">Allotment Letter No.</Label>
              <Input id="c-allot-no" value={form.allotmentLetterNo} onChange={(e) => set("allotmentLetterNo", e.target.value)} placeholder="e.g. AL-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-allot-date">Allotment Date</Label>
              <Input id="c-allot-date" type="date" value={form.allotmentDate} onChange={(e) => set("allotmentDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-bba-no">BBA No.</Label>
              <Input id="c-bba-no" value={form.bbaNo} onChange={(e) => set("bbaNo", e.target.value)} placeholder="Builder-Buyer Agreement no." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-bba-date">BBA Date</Label>
              <Input id="c-bba-date" type="date" value={form.bbaDate} onChange={(e) => set("bbaDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-tds-amt">TDS Amount (₹)</Label>
              <Input id="c-tds-amt" type="number" min="0" step="0.01" value={form.tdsAmount} onChange={(e) => set("tdsAmount", e.target.value)} placeholder="1% of sale price (if > ₹50L)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tds-cert">TDS Certificate No.</Label>
              <Input id="c-tds-cert" value={form.tdsCertificateNo} onChange={(e) => set("tdsCertificateNo", e.target.value)} placeholder="Form 16B no." />
            </div>
          </div>
        </div>

        {/* ── Home loan details ── */}
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="text-body font-semibold">Home Loan Details (if applicable)</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-loan-bank">Bank / Lender</Label>
              <Input id="c-loan-bank" value={form.homeLoanBank} onChange={(e) => set("homeLoanBank", e.target.value)} placeholder="e.g. HDFC, SBI" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-loan-amt">Loan Amount (₹)</Label>
              <Input id="c-loan-amt" type="number" min="0" step="0.01" value={form.homeLoanAmount} onChange={(e) => set("homeLoanAmount", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-loan-no">Sanction No.</Label>
              <Input id="c-loan-no" value={form.homeLoanSanctionNo} onChange={(e) => set("homeLoanSanctionNo", e.target.value)} placeholder="Loan sanction letter no." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-loan-date">Sanction Date</Label>
              <Input id="c-loan-date" type="date" value={form.homeLoanSanctionDate} onChange={(e) => set("homeLoanSanctionDate", e.target.value)} />
            </div>
          </div>
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
