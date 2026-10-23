"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { required, phone, email, gstin, nonNegativeNumber } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import type { SupplierRow } from "@/lib/types";

type FormState = {
  name: string;
  gstin: string;
  pan: string;
  tdsSection: string;
  tdsRate: string;
  phone: string;
  email: string;
  address: string;
  leadTimeDays: string;
  openingBalance: string;
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Kept in sync with TDS_SECTION_DEFAULTS in @nirman/services — duplicated
// here because the dialog is a client component and the service barrel pulls
// in server-only deps.
const TDS_SECTIONS: { value: string; label: string; rate: number }[] = [
  { value: "194C", label: "194C — Contractor (2% others / 1% ind.·HUF)", rate: 2 },
  { value: "194J", label: "194J — Professional/technical fees · 10%", rate: 10 },
  { value: "194I", label: "194I — Rent · 10%", rate: 10 },
  { value: "194A", label: "194A — Interest · 10%", rate: 10 },
];

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onCreated,
  existingSuppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: (Omit<SupplierRow, "openPOs" | "balanceOwed"> & { balanceOwed?: number; openPOs?: number }) | null;
  onCreated?: (entity: { id: string; label?: string }) => void;
  /** Optional list for client-side duplicate GSTIN check. */
  existingSuppliers?: SupplierRow[];
}) {
  const router = useRouter();
  const isEdit = supplier != null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: supplier?.name ?? "",
    gstin: supplier?.gstin ?? "",
    pan: supplier?.pan ?? "",
    tdsSection: supplier?.tdsSection ?? "",
    tdsRate: supplier?.tdsRate != null ? String(supplier.tdsRate) : "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    leadTimeDays: supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "",
    openingBalance: "",
  });

  const validationRules: ValidationRules<FormState> = {
    name: (v) => required(v as string, "Supplier Name"),
    phone: (v) => phone(v as string),
    email: (v) => email(v as string),
    gstin: (v) => gstin(v as string),
    pan: (v) => {
      const s = (v as string).trim();
      return !s || PAN_RE.test(s) ? undefined : "PAN must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)";
    },
    tdsRate: (v) => nonNegativeNumber(v as string, "TDS rate"),
    leadTimeDays: (v) => nonNegativeNumber(v as string, "Lead Time"),
    openingBalance: (v) => nonNegativeNumber(v as string, "Opening Balance"),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
    setForm({
      name: supplier?.name ?? "",
      gstin: supplier?.gstin ?? "",
      pan: supplier?.pan ?? "",
      tdsSection: supplier?.tdsSection ?? "",
      tdsRate: supplier?.tdsRate != null ? String(supplier.tdsRate) : "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      leadTimeDays: supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "",
      openingBalance: "",
    });
  }, [open, supplier, clearAll]);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll(form)) {
      toast.error("Please fix the errors in the form");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gstin: form.gstin.trim() || null,
        pan: form.pan.trim() || null,
        tdsSection: form.tdsSection || null,
        tdsRate: form.tdsRate.trim() === "" ? null : Number(form.tdsRate),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        leadTimeDays: form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays),
        ...(!isEdit && form.openingBalance.trim() !== "" && Number(form.openingBalance) > 0
          ? { openingBalance: Number(form.openingBalance) }
          : {}),
      };
      const url = supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers";
      const method = supplier ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save supplier");
      toast.success(isEdit ? "Supplier updated" : "Supplier created");
      onOpenChange(false);
      if (!isEdit && onCreated) {
        onCreated({ id: data.id, label: data.name });
      } else {
        router.refresh();
      }
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
      title={isEdit ? "Edit Supplier" : "New Supplier"}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Supplier Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={() => onBlur("name", form)} aria-invalid={!!errors.name} placeholder="e.g. ABC Cement Agencies" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN" error={errors.gstin}>
            <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} onBlur={() => onBlur("gstin", form)} aria-invalid={!!errors.gstin} placeholder="29ABCDE1234F1Z5" />
            {form.gstin.trim() && existingSuppliers && existingSuppliers.some((s) => s.gstin === form.gstin.trim() && s.id !== supplier?.id) && (
              <p className="text-caption text-warning" role="alert">
                ⚠ Another supplier already uses this GSTIN.
              </p>
            )}
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input aria-label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => onBlur("phone", form)} aria-invalid={!!errors.phone} placeholder="98765 43210" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PAN" error={errors.pan} hint="Required for TDS filings — payments deduct 20% u/s 206AA when absent.">
            <Input aria-label="PAN" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} onBlur={() => onBlur("pan", form)} aria-invalid={!!errors.pan} placeholder="ABCDE1234F" maxLength={10} />
          </Field>
          <Field label="TDS Section" hint="Default deduction for payments to this supplier.">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.tdsSection}
              onChange={(e) => {
                const sec = e.target.value;
                set("tdsSection", sec);
                // Auto-fill the section's statutory rate unless the user has
                // typed a custom override they want to keep.
                if (sec && !form.tdsRate) {
                  const def = TDS_SECTIONS.find((t) => t.value === sec);
                  if (def) set("tdsRate", String(def.rate));
                }
              }}
              aria-label="TDS section"
            >
              <option value="">No TDS default</option>
              {TDS_SECTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.tdsSection && (
          <Field label="TDS Rate (%)" error={errors.tdsRate} hint="Override the statutory rate when the supplier's facts differ (e.g. lower-deduction certificate u/s 197).">
            <Input aria-label="No TDS default" type="number" min="0" max="100" step="0.01" value={form.tdsRate} onChange={(e) => set("tdsRate", e.target.value)} onBlur={() => onBlur("tdsRate", form)} aria-invalid={!!errors.tdsRate} placeholder="e.g. 2" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => onBlur("email", form)} aria-invalid={!!errors.email} placeholder="supplier@example.com" />
          </Field>
          <Field label="Lead Time (days)" error={errors.leadTimeDays} hint="Average vendor lead time — used by the Logistics Decision Engine (S_lead).">
            <Input aria-label="Lead Time Days" type="number" min="0" value={form.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} onBlur={() => onBlur("leadTimeDays", form)} aria-invalid={!!errors.leadTimeDays} placeholder="e.g. 7" />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Shop/street, area, city, PIN" />
        </Field>
        {!isEdit && (
          <Field label="Opening Balance Owed (₹)" error={errors.openingBalance} hint="Unpaid bills carried in at go-live — posts Cr Accounts Payable / Dr Opening Balance Equity.">
            <Input aria-label="Opening Balance" type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} onBlur={() => onBlur("openingBalance", form)} aria-invalid={!!errors.openingBalance} placeholder="Optional" />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Supplier"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}