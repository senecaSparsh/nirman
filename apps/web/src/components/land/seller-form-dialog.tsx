"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { required, phone, gstin } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";

export type SellerFormValues = {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  notes?: string | null;
};

export function SellerFormDialog({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<SellerFormValues>;
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SellerFormValues>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    gstin: initial?.gstin ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });

  const validationRules: ValidationRules<SellerFormValues> = {
    name: (v) => required(v as string, "Name"),
    phone: (v) => phone(v as string),
    gstin: (v) => gstin(v as string),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<SellerFormValues>(validationRules);

  useEffect(() => {
    if (!open) return;
    clearAll();
  }, [open]);

  function set<K extends keyof SellerFormValues>(key: K, value: SellerFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll(form)) {
      toast.error("Please fix the errors in the form");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/land-sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone?.trim() || null,
          email: form.email?.trim() || null,
          gstin: form.gstin?.trim() || null,
          address: form.address?.trim() || null,
          notes: form.notes?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create seller");
      toast.success("Seller created");
      onOpenChange(false);
      if (onCreated) onCreated({ id: data.id, label: data.name });
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
      title="New Land Seller"
      description="Add a seller to reuse across land purchases."
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="seller-form" disabled={saving}>
            {saving ? "Saving…" : "Create Seller"}
          </Button>
        </div>
      }
    >
      <form id="seller-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={() => onBlur("name", form)} aria-invalid={!!errors.name} placeholder="e.g. Suresh Patel" autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} onBlur={() => onBlur("phone", form)} aria-invalid={!!errors.phone} placeholder="98765 43210" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="seller@email.com" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN" error={errors.gstin}>
            <Input value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value)} onBlur={() => onBlur("gstin", form)} aria-invalid={!!errors.gstin} placeholder="22AAAAA0000A1Z5" />
          </Field>
          <Field label="Address">
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Village, district, state" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional notes about this seller" />
        </Field>
      </form>
    </Dialog>
  );
}
