"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Field } from "@/components/field";
import { HsnSacSearch } from "@/components/hsn-sac-search";
import { required, numberInRange, validateForm } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import type { MaterialCategory } from "@/lib/types";

type ValidationState = {
  name: string;
  unit: string;
  gstRate: string;
};

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
  onCreated?: (entity: { id: string; label?: string; unit?: string; hsnCode?: string | null; gstRate?: number | null }) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [unit, setUnit] = useState(category?.unit ?? "NOS");
  const [classValue, setClassValue] = useState(category?.class ?? "RAW_MATERIAL");
  const [hsnCode, setHsnCode] = useState((category as { hsnCode?: string | null })?.hsnCode ?? "");
  const [gstRate, setGstRate] = useState((category as { gstRate?: number | string | null })?.gstRate != null ? Number((category as { gstRate?: number | string | null })?.gstRate) : undefined);
  const [saving, setSaving] = useState(false);
  const isEdit = category != null;

  // ── Inline validation ──────────────────────────────────────────
  // Validates on blur and shows red error text under the field instantly.
  const validationRules: ValidationRules<ValidationState> = {
    name: (v) => required(v as string, "Category name"),
    unit: (v) => required(v as string, "Default unit"),
    gstRate: (v) => numberInRange(v as string, 0, 100, "GST Rate"),
  };
  const { errors, setErrors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<ValidationState>(validationRules);
  const validationForm: ValidationState = { name, unit, gstRate: gstRate == null ? "" : String(gstRate) };

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
    setName(category?.name ?? "");
    setUnit(category?.unit ?? "NOS");
    setClassValue(category?.class ?? "RAW_MATERIAL");
    setHsnCode((category as { hsnCode?: string | null })?.hsnCode ?? "");
    setGstRate((category as { gstRate?: number | string | null })?.gstRate != null ? Number((category as { gstRate?: number | string | null })?.gstRate) : undefined);
  }, [open, category]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formErrors = validateForm(validationForm, {
      name: (v) => required(v as string, "Category name"),
      unit: (v) => required(v as string, "Default unit"),
      gstRate: (v) => numberInRange(v as string, 0, 100, "GST Rate"),
    });
    if (Object.keys(formErrors).length > 0) {
      const firstError = Object.values(formErrors)[0]!;
      toast.error(firstError);
      setErrors(formErrors);
      return;
    }
    setSaving(true);
    try {
      const payload = {
      name: name.trim(),
      unit: unit.trim(),
      class: classValue,
      hsnCode: hsnCode.trim() || undefined,
      gstRate: gstRate,
    };
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
        onCreated({ id: data.id, label: data.name, unit: data.unit, hsnCode: data.hsnCode ?? null, gstRate: data.gstRate != null ? Number(data.gstRate) : null });
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
        <Field label="Name" required error={errors.name}>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); clearError("name"); }}
            onBlur={() => onBlur("name", validationForm)}
            aria-invalid={!!errors.name}
            placeholder="e.g. Cement & Binding"
            required
            autoFocus
          />
        </Field>
        <Field label="Default Unit" required error={errors.unit}>
          <Input
            value={unit}
            onChange={(e) => { setUnit(e.target.value); clearError("unit"); }}
            onBlur={() => onBlur("unit", validationForm)}
            aria-invalid={!!errors.unit}
            placeholder="BAG / KG / NOS"
            required
          />
        </Field>
        <Field label="Material Class">
          <select
            value={classValue}
            onChange={(e) => setClassValue(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
          >
            {CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} — {opt.hint}</option>
            ))}
          </select>
        </Field>
        <Field label="Default HSN/SAC Code">
          <HsnSacSearch
            value={hsnCode}
            onCodeChange={setHsnCode}
            onGstRateChange={(rate) => setGstRate(rate)}
            placeholder="Search or type HSN/SAC code…"
            materialName={name}
          />
          <p className="text-micro text-muted-foreground">
            Materials created in this category will auto-fill this HSN code and GST rate.
          </p>
        </Field>
        <Field label="Default GST Rate (%)" error={errors.gstRate}>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={gstRate ?? ""}
            onChange={(e) => { setGstRate(e.target.value === "" ? undefined : Number(e.target.value)); clearError("gstRate"); }}
            onBlur={() => onBlur("gstRate", validationForm)}
            aria-invalid={!!errors.gstRate}
            placeholder="Auto-filled from HSN"
          />
          <p className="text-micro text-muted-foreground">
            Override only if the HSN master rate doesn't apply. Leave blank to use the government master rate.
          </p>
        </Field>
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
