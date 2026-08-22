"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

  function set<K extends keyof SellerFormValues>(key: K, value: SellerFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Seller name is required");
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
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Suresh Patel" autoFocus required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="seller@email.com" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Village, district, state" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional notes about this seller" />
        </div>
      </form>
    </Dialog>
  );
}
