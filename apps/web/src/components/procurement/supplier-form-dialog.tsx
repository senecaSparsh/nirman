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
  phone: string;
  email: string;
  address: string;
  leadTimeDays: string;
};

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
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    leadTimeDays: supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "",
  });

  const validationRules: ValidationRules<FormState> = {
    name: (v) => required(v as string, "Supplier Name"),
    phone: (v) => phone(v as string),
    email: (v) => email(v as string),
    gstin: (v) => gstin(v as string),
    leadTimeDays: (v) => nonNegativeNumber(v as string, "Lead Time"),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
    setForm({
      name: supplier?.name ?? "",
      gstin: supplier?.gstin ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      leadTimeDays: supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "",
    });
  }, [open, supplier]);

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
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        leadTimeDays: form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays),
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
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => onBlur("phone", form)} aria-invalid={!!errors.phone} placeholder="98765 43210" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => onBlur("email", form)} aria-invalid={!!errors.email} placeholder="supplier@example.com" />
          </Field>
          <Field label="Lead Time (days)" error={errors.leadTimeDays} hint="Average vendor lead time — used by the Logistics Decision Engine (S_lead).">
            <Input type="number" min="0" value={form.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} onBlur={() => onBlur("leadTimeDays", form)} aria-invalid={!!errors.leadTimeDays} placeholder="e.g. 7" />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Shop/street, area, city, PIN" />
        </Field>
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
