"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { MaterialCategory } from "@/lib/types";

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: MaterialCategory | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [unit, setUnit] = useState(category?.unit ?? "NOS");
  const [saving, setSaving] = useState(false);
  const isEdit = category != null;

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setUnit(category?.unit ?? "NOS");
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
      const payload = { name: name.trim(), unit: unit.trim() };
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
      router.refresh();
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
