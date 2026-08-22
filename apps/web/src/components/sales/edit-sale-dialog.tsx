"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { AssetSaleRow } from "@/lib/types";

/**
 * Edit mutable fields on an existing sale.
 *
 * - Price: only editable pre-completion with no payments (enforced server-side).
 * - Notes, compliance, broker, home loan, deal terms: always editable.
 *
 * The form is sectioned to match the creation dialog's structure, but only
 * includes fields that are safe to mutate post-creation. Read-only fields
 * (asset, customer, cost basis) are shown as context, not inputs.
 */
export function EditSaleDialog({
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
    salePrice: "",
    gstRate: "",
    notes: "",
    // Compliance
    saleDeedNo: "",
    allotmentLetterNo: "",
    allotmentDate: "",
    bbaNo: "",
    bbaDate: "",
    tdsAmount: "",
    tdsCertificateNo: "",
    // Home loan
    homeLoanBank: "",
    homeLoanAmount: "",
    homeLoanSanctionNo: "",
    homeLoanSanctionDate: "",
    // Broker
    brokerName: "",
    brokerPhone: "",
    commissionAmount: "",
    // Deal terms
    expectedRegistryDate: "",
    dealMaturityMonths: "",
    paymentCycle: "",
  });

  // Sync form from sale when opened
  // (useState initializer runs once; this effect syncs on each open)
  // Using a key-based reset pattern would be cleaner, but this matches
  // the existing dialog patterns in the codebase.
  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (!sale) return null;
  const s = sale; // capture for narrowing inside closures

  // Price is editable only pre-completion with no payments
  const canEditPrice = s.saleStage !== "COMPLETED" && s.paymentCount === 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { action: "update" };
      if (canEditPrice && form.salePrice) payload.salePrice = Number(form.salePrice);
      if (form.gstRate) payload.gstRate = Number(form.gstRate);
      if (form.notes !== s.notes) payload.notes = form.notes.trim() || null;
      // Compliance
      if (form.saleDeedNo !== (s.saleDeedNo ?? "")) payload.saleDeedNo = form.saleDeedNo.trim() || null;
      if (form.allotmentLetterNo !== (s.allotmentLetterNo ?? "")) payload.allotmentLetterNo = form.allotmentLetterNo.trim() || null;
      if (form.allotmentDate) payload.allotmentDate = form.allotmentDate;
      if (form.bbaNo !== (s.bbaNo ?? "")) payload.bbaNo = form.bbaNo.trim() || null;
      if (form.bbaDate) payload.bbaDate = form.bbaDate;
      if (form.tdsAmount) payload.tdsAmount = Number(form.tdsAmount);
      if (form.tdsCertificateNo !== (s.tdsCertificateNo ?? "")) payload.tdsCertificateNo = form.tdsCertificateNo.trim() || null;
      // Home loan
      if (form.homeLoanBank !== (s.homeLoanBank ?? "")) payload.homeLoanBank = form.homeLoanBank.trim() || null;
      if (form.homeLoanAmount) payload.homeLoanAmount = Number(form.homeLoanAmount);
      if (form.homeLoanSanctionNo !== (s.homeLoanSanctionNo ?? "")) payload.homeLoanSanctionNo = form.homeLoanSanctionNo.trim() || null;
      if (form.homeLoanSanctionDate) payload.homeLoanSanctionDate = form.homeLoanSanctionDate;
      // Broker
      if (form.brokerName !== (s.brokerName ?? "")) payload.brokerName = form.brokerName.trim() || null;
      if (form.brokerPhone !== (s.brokerPhone ?? "")) payload.brokerPhone = form.brokerPhone.trim() || null;
      if (form.commissionAmount) payload.commissionAmount = Number(form.commissionAmount);
      // Deal terms
      if (form.expectedRegistryDate) payload.expectedRegistryDate = form.expectedRegistryDate;
      if (form.dealMaturityMonths) payload.dealMaturityMonths = Number(form.dealMaturityMonths);
      if (form.paymentCycle !== (s.paymentCycle ?? "")) payload.paymentCycle = form.paymentCycle.trim() || null;

      const res = await fetch(`/api/sales/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update sale");
      toast.success("Sale updated");
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update sale");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Sale"
      description={`${sale.saleNumber} · ${sale.customerName}`}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ── Price (only pre-completion) ── */}
        <section className="space-y-3">
          <h3 className="text-section text-foreground">Deal</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-price">Sale Price {canEditPrice ? "*" : "(locked)"}</Label>
              <Input
                id="es-price"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice || String(sale.salePrice)}
                onChange={(e) => set("salePrice", e.target.value)}
                disabled={!canEditPrice}
              />
              {!canEditPrice && (
                <p className="text-caption text-muted-foreground">
                  Price is locked once payments are recorded or the sale completes.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-gst">GST Rate (%)</Label>
              <Input
                id="es-gst"
                type="number"
                min="0"
                max="28"
                step="0.01"
                value={form.gstRate || (sale.gstRate ? String(sale.gstRate) : "")}
                onChange={(e) => set("gstRate", e.target.value)}
                disabled={!canEditPrice}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-notes">Notes</Label>
            <Textarea
              id="es-notes"
              rows={2}
              value={form.notes || (sale.notes ?? "")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Internal notes about this sale…"
            />
          </div>
        </section>

        {/* ── Compliance ── */}
        <section className="space-y-3">
          <h3 className="text-section text-foreground">Compliance Documents</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-deed">Sale Deed No.</Label>
              <Input id="es-deed" value={form.saleDeedNo || (sale.saleDeedNo ?? "")} onChange={(e) => set("saleDeedNo", e.target.value)} placeholder="SR-1234/2025" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-allot-no">Allotment Letter No.</Label>
              <Input id="es-allot-no" value={form.allotmentLetterNo || (sale.allotmentLetterNo ?? "")} onChange={(e) => set("allotmentLetterNo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-allot-date">Allotment Date</Label>
              <Input id="es-allot-date" type="date" value={form.allotmentDate || (sale.allotmentDate ? sale.allotmentDate.split("T")[0]! : "")} onChange={(e) => set("allotmentDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-bba-no">BBA No.</Label>
              <Input id="es-bba-no" value={form.bbaNo || (sale.bbaNo ?? "")} onChange={(e) => set("bbaNo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-bba-date">BBA Date</Label>
              <Input id="es-bba-date" type="date" value={form.bbaDate || (sale.bbaDate ? sale.bbaDate.split("T")[0]! : "")} onChange={(e) => set("bbaDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-tds-amt">TDS Amount</Label>
              <Input id="es-tds-amt" type="number" min="0" step="0.01" value={form.tdsAmount || (sale.tdsAmount ? String(sale.tdsAmount) : "")} onChange={(e) => set("tdsAmount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-tds-cert">TDS Certificate No.</Label>
              <Input id="es-tds-cert" value={form.tdsCertificateNo || (sale.tdsCertificateNo ?? "")} onChange={(e) => set("tdsCertificateNo", e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── Home loan ── */}
        <section className="space-y-3">
          <h3 className="text-section text-foreground">Home Loan</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-loan-bank">Bank / Lender</Label>
              <Input id="es-loan-bank" value={form.homeLoanBank || (sale.homeLoanBank ?? "")} onChange={(e) => set("homeLoanBank", e.target.value)} placeholder="HDFC, SBI…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-loan-amt">Loan Amount</Label>
              <Input id="es-loan-amt" type="number" min="0" step="0.01" value={form.homeLoanAmount || (sale.homeLoanAmount ? String(sale.homeLoanAmount) : "")} onChange={(e) => set("homeLoanAmount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-loan-no">Sanction No.</Label>
              <Input id="es-loan-no" value={form.homeLoanSanctionNo || (sale.homeLoanSanctionNo ?? "")} onChange={(e) => set("homeLoanSanctionNo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-loan-date">Sanction Date</Label>
              <Input id="es-loan-date" type="date" value={form.homeLoanSanctionDate || (sale.homeLoanSanctionDate ? sale.homeLoanSanctionDate.split("T")[0]! : "")} onChange={(e) => set("homeLoanSanctionDate", e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── Broker ── */}
        {sale.dealSource === "BROKER" && (
          <section className="space-y-3">
            <h3 className="text-section text-foreground">Broker</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="es-broker-name">Name</Label>
                <Input id="es-broker-name" value={form.brokerName || (sale.brokerName ?? "")} onChange={(e) => set("brokerName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-broker-phone">Phone</Label>
                <Input id="es-broker-phone" value={form.brokerPhone || (sale.brokerPhone ?? "")} onChange={(e) => set("brokerPhone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-commission">Commission Amount</Label>
                <Input id="es-commission" type="number" min="0" step="0.01" value={form.commissionAmount || (sale.commissionAmount ? String(sale.commissionAmount) : "")} onChange={(e) => set("commissionAmount", e.target.value)} />
              </div>
            </div>
          </section>
        )}

        {/* ── Deal terms ── */}
        <section className="space-y-3">
          <h3 className="text-section text-foreground">Deal Terms</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-registry-date">Expected Registry Date</Label>
              <Input id="es-registry-date" type="date" value={form.expectedRegistryDate || (sale.expectedRegistryDate ? sale.expectedRegistryDate.split("T")[0]! : "")} onChange={(e) => set("expectedRegistryDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-maturity">Maturity (months)</Label>
              <Input id="es-maturity" type="number" min="0" value={form.dealMaturityMonths || (sale.dealMaturityMonths ? String(sale.dealMaturityMonths) : "")} onChange={(e) => set("dealMaturityMonths", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="es-cycle">Payment Cycle</Label>
              <Input id="es-cycle" value={form.paymentCycle || (sale.paymentCycle ?? "")} onChange={(e) => set("paymentCycle", e.target.value)} placeholder="e.g. Quarterly, 25% every month" />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
