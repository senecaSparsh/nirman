"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["Heavy Machinery", "Power Tool", "Vehicle", "Scaffolding", "Other"];

export function EquipmentFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assetTag: "",
    name: "",
    model: "",
    serialNumber: "",
    category: "",
    acquisitionCost: "",
    purchaseDate: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assetTag.trim()) {
      toast.error("Asset tag is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const cost = Number(form.acquisitionCost);
    if (form.acquisitionCost === "" || Number.isNaN(cost) || cost < 0) {
      toast.error("Acquisition cost must be a number >= 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        assetTag: form.assetTag.trim(),
        name: form.name.trim(),
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        category: form.category || null,
        acquisitionCost: cost,
        purchaseDate: form.purchaseDate || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create equipment");
      if (onCreated) {
        toast.success("Equipment created");
      } else {
        toast.success("Equipment created", {
          description: "Assign it to a project or site to start tracking usage.",
          action: {
            label: "View Equipment",
            onClick: () => router.push("/equipment"),
          },
        });
      }
      onOpenChange(false);
      setForm({
        assetTag: "", name: "", model: "", serialNumber: "", category: "",
        acquisitionCost: "", purchaseDate: "", notes: "",
      });
      if (onCreated) {
        onCreated({ id: data.id, label: form.name.trim() });
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
      title="New Equipment"
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="eq-assetTag">Asset Tag *</Label>
          <Input
            id="eq-assetTag"
            value={form.assetTag}
            onChange={(e) => set("assetTag", e.target.value)}
            placeholder="e.g. EXC-001"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-name">Name *</Label>
          <Input
            id="eq-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. JCB 3DX Excavator"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eq-model">Model</Label>
            <Input
              id="eq-model"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-serial">Serial Number</Label>
            <Input
              id="eq-serial"
              value={form.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eq-category">Category</Label>
            <Select
              id="eq-category"
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
            <Label htmlFor="eq-cost">Acquisition Cost *</Label>
            <Input
              id="eq-cost"
              type="number"
              min="0"
              step="0.01"
              value={form.acquisitionCost}
              onChange={(e) => set("acquisitionCost", e.target.value)}
              placeholder="0"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-purchaseDate">Purchase Date</Label>
          <Input
            id="eq-purchaseDate"
            type="date"
            value={form.purchaseDate}
            onChange={(e) => set("purchaseDate", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-notes">Notes</Label>
          <Textarea
            id="eq-notes"
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
            {saving ? "Creating…" : "Create Equipment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
