"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { MaterialCategory, MaterialRow } from "@/lib/types";

type FormState = {
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  hsnCode: string;
  gstRate: string;
  standardCost: string;
  minStock: string;
  description: string;
};

const empty: FormState = {
  code: "",
  name: "",
  categoryId: "",
  unit: "NOS",
  hsnCode: "",
  gstRate: "0",
  standardCost: "0",
  minStock: "",
  description: "",
};

export function MaterialFormDialog({
  open,
  onOpenChange,
  categories,
  material,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MaterialCategory[];
  material: MaterialRow | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    material
      ? {
          code: material.code,
          name: material.name,
          categoryId: material.categoryId,
          unit: material.unit,
          hsnCode: material.hsnCode ?? "",
          gstRate: String(material.gstRate),
          standardCost: String(material.standardCost),
          minStock: material.minStock == null ? "" : String(material.minStock),
          description: material.description ?? "",
        }
      : empty,
  );
  const [saving, setSaving] = useState(false);

  const isEdit = material != null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Please select a category");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        unit: form.unit.trim(),
        hsnCode: form.hsnCode.trim() || null,
        gstRate: Number(form.gstRate) || 0,
        standardCost: Number(form.standardCost) || 0,
        minStock: form.minStock.trim() === "" ? null : Number(form.minStock),
        description: form.description.trim() || null,
      };
      const res = await fetch(
        isEdit ? `/api/materials/${material!.id}` : "/api/materials",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save material");
      toast.success(isEdit ? "Material updated" : "Material created");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Material" : "New Material"}
      description={isEdit ? "Update material details." : "Add a new material to the catalog."}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="CEM-OPC53"
              required
              disabled={isEdit}
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Cement OPC 53 Grade"
              required
            />
          </Field>
          <Field label="Category" required>
            <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
              <option value="" disabled>
                Select category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit of Measure" required>
            <Input
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="BAG / KG / NOS / MTR"
              required
            />
          </Field>
          <Field label="HSN/SAC Code">
            <Input
              value={form.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value)}
              placeholder="25232900"
            />
          </Field>
          <Field label="GST Rate (%)">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.gstRate}
              onChange={(e) => set("gstRate", e.target.value)}
            />
          </Field>
          <Field label="Standard Cost (₹)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.standardCost}
              onChange={(e) => set("standardCost", e.target.value)}
            />
          </Field>
          <Field label="Min Stock (reorder threshold)">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.minStock}
              onChange={(e) => set("minStock", e.target.value)}
              placeholder="Leave empty for no alert"
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("description", e.target.value)}
            placeholder="Optional notes about grade, brand, specs…"
            rows={2}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create material"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
    </div>
  );
}
