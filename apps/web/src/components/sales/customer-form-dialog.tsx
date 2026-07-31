"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRow } from "@/lib/types";

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: (Omit<CustomerRow, "activeSales"> & { activeSales?: number }) | null;
}) {
  const router = useRouter();
  const isEdit = customer != null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    gstin: customer?.gstin ?? "",
    address: customer?.address ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Customer name is required");
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
      toast.success(isEdit ? "Customer updated" : "Customer created");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
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
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name *</Label>
          <Input id="c-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-gstin">GSTIN</Label>
          <Input id="c-gstin" value={form.gstin} onChange={(e) => set("gstin", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-address">Address</Label>
          <Textarea id="c-address" value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
        </div>
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
