"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { required, phone, email, gstin } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import type { CustomerRow } from "@/lib/types";

type FormState = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: (Omit<CustomerRow, "activeSales"> & { activeSales?: number }) | null;
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const isEdit = customer != null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    gstin: customer?.gstin ?? "",
    address: customer?.address ?? "",
  });

  const validationRules: ValidationRules<FormState> = {
    name: (v) => required(v as string, "Customer Name"),
    phone: (v) => phone(v as string),
    email: (v) => email(v as string),
    gstin: (v) => gstin(v as string),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
    setForm({
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      gstin: customer?.gstin ?? "",
      address: customer?.address ?? "",
    });
  }, [open, customer]);

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
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        gstin: form.gstin.trim() || null,
        address: form.address.trim() || null,
      };
      const url = customer ? `/api/customers/${customer.id}` : "/api/customers";
      const method = customer ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save customer");
      if (isEdit) {
        toast.success("Customer updated");
      } else if (onCreated) {
        toast.success("Customer created");
      } else {
        toast.success("Customer created", {
          description: "Ready to sell? Start a new sale with this customer.",
          action: {
            label: "New Sale",
            onClick: () => router.push("/sales"),
          },
        });
      }
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
      title={isEdit ? "Edit Customer" : "New Customer"}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Customer Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={() => onBlur("name", form)} aria-invalid={!!errors.name} placeholder="e.g. Rajesh Sharma" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => onBlur("phone", form)} aria-invalid={!!errors.phone} placeholder="98765 43210" />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => onBlur("email", form)} aria-invalid={!!errors.email} placeholder="customer@example.com" />
          </Field>
        </div>
        <Field label="GSTIN" error={errors.gstin}>
          <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} onBlur={() => onBlur("gstin", form)} aria-invalid={!!errors.gstin} placeholder="29ABCDE1234F1Z5" />
        </Field>
        <Field label="Address">
          <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Flat/house no, street, area, city, PIN" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Customer"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
