"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SupplierRow } from "@/lib/types";

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: (Omit<SupplierRow, "openPOs" | "balanceOwed"> & { balanceOwed?: number; openPOs?: number }) | null;
}) {
  const router = useRouter();
  const isEdit = supplier != null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    gstin: supplier?.gstin ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
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
      title={isEdit ? "Edit Supplier" : "New Supplier"}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Supplier Name *</Label>
          <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. ABC Cement Agencies" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-gstin">GSTIN</Label>
            <Input id="s-gstin" value={form.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="29ABCDE1234F1Z5" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-phone">Phone</Label>
            <Input id="s-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-email">Email</Label>
          <Input id="s-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="supplier@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-address">Address</Label>
          <Textarea id="s-address" value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Shop/street, area, city, PIN" />
        </div>
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
