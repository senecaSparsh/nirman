"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { MaterialCategory } from "@/lib/types";

const CLASS_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "RAW_MATERIAL", label: "Raw Material", hint: "Cement, steel, brick, timber — core construction inputs" },
  { value: "CONSUMABLE", label: "Consumable", hint: "Fasteners, sealants, paint, safety gear — used up in work" },
  { value: "MRO", label: "MRO", hint: "Lubricants, repair parts, maintenance supplies" },
  { value: "TEMPORARY", label: "Temporary", hint: "Scaffolding, fencing, formwork, tarps — reusable" },
];

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: MaterialCategory | null;
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [unit, setUnit] = useState(category?.unit ?? "NOS");
  const [classValue, setClassValue] = useState(category?.class ?? "RAW_MATERIAL");
  const [saving, setSaving] = useState(false);
  const isEdit = category != null;

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setUnit(category?.unit ?? "NOS");
    setClassValue(category?.class ?? "RAW_MATERIAL");
  }, [open, category]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    if (!unit.trim()) {
      toast.error("Default unit is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), unit: unit.trim(), class: classValue };
      const res = await fetch(
        isEdit ? `/api/material-categories/${category!.id}` : "/api/material-categories",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save category");
      toast.success(isEdit ? "Category updated" : "Category created");
      onOpenChange(false);
      if (!isEdit && onCreated) {
        onCreated({ id: data.id, label: data.name });
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Category" : "New Material Category"}
      description="Categories group materials and define a default unit of measure."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>
            Name <span className="text-danger">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cement & Binding"
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Default Unit <span className="text-danger">*</span>
          </Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="BAG / KG / NOS"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Material Class</Label>
          <select
            value={classValue}
            onChange={(e) => setClassValue(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
          >
            {CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} — {opt.hint}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create category"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
