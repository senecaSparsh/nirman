"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["Heavy Machinery", "Power Tool", "Vehicle", "Scaffolding", "Other"];

export function EquipmentEditDialog({
  open,
  onOpenChange,
  equipmentId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  initial: {
    name: string;
    model?: string | null;
    serialNumber?: string | null;
    category?: string | null;
    notes?: string | null;
  };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial.name,
    model: initial.model ?? "",
    serialNumber: initial.serialNumber ?? "",
    category: initial.category ?? "",
    notes: initial.notes ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${equipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name: form.name.trim(),
          model: form.model.trim() || null,
          serialNumber: form.serialNumber.trim() || null,
          category: form.category || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update equipment");
      toast.success("Equipment updated");
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
      title="Edit Equipment"
      description="Update equipment details. Asset tag, cost, and purchase date are set at creation."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ee-name">Name *</Label>
          <Input
            id="ee-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. JCB 3DX Excavator"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ee-model">Model</Label>
            <Input
              id="ee-model"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-serial">Serial Number</Label>
            <Input
              id="ee-serial"
              value={form.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ee-category">Category</Label>
          <Select
            id="ee-category"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Select category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ee-notes">Notes</Label>
          <Textarea
            id="ee-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
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
