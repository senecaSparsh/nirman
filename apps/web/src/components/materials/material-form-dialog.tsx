"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {Input, Textarea} from "@/components/ui/input";
import { Field } from "@/components/field";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { CategoryFormDialog } from "@/components/materials/category-form-dialog";
import { HsnSacSearch } from "@/components/hsn-sac-search";
import type { MaterialCategory, MaterialRow } from "@/lib/types";

type FormState = {
  code: string;
  name: string;
  grade: string;
  specification: string;
  categoryId: string | null;
  unit: string;
  hsnCode: string;
  gstRate: string;
  standardCost: string;
  minStock: string;
  reorderPoint: string;
  economicOrderQty: string;
  volumetricDensity: string;
  bulkDiscountPct: string;
  isCorporateCommodity: boolean;
  isLotTracked: boolean;
  isScrap: boolean;
  baseUnit: string;
  secondaryUnit: string;
  uomConversionFactor: string;
  description: string;
};

const empty: FormState = {
  code: "",
  name: "",
  grade: "",
  specification: "",
  categoryId: "",
  unit: "NOS",
  hsnCode: "",
  gstRate: "0",
  standardCost: "0",
  minStock: "",
  reorderPoint: "",
  economicOrderQty: "",
  volumetricDensity: "",
  bulkDiscountPct: "",
  isCorporateCommodity: false,
  isLotTracked: false,
  isScrap: false,
  baseUnit: "",
  secondaryUnit: "",
  uomConversionFactor: "",
  description: "",
};

export function MaterialFormDialog({
  open,
  onOpenChange,
  categories,
  material,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MaterialCategory[];
  material: MaterialRow | null;
  /** Fired with the newly created material (create-only). When provided, the
   * dialog skips router.refresh and lets the caller wire the new entity in. */
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    material
      ? {
          code: material.code,
          name: material.name,
          grade: material.grade ?? "",
          specification: material.specification ?? "",
          categoryId: material.categoryId ?? "",
          unit: material.unit,
          hsnCode: material.hsnCode ?? "",
          gstRate: String(material.gstRate),
          standardCost: String(material.standardCost),
          minStock: material.minStock == null ? "" : String(material.minStock),
          reorderPoint: material.reorderPoint == null ? "" : String(material.reorderPoint),
          economicOrderQty: material.economicOrderQty == null ? "" : String(material.economicOrderQty),
          volumetricDensity: material.volumetricDensity == null ? "" : String(material.volumetricDensity),
          bulkDiscountPct: material.bulkDiscountPct == null ? "" : String(material.bulkDiscountPct),
          isCorporateCommodity: material.isCorporateCommodity ?? false,
          isLotTracked: material.isLotTracked ?? false,
          isScrap: material.isScrap ?? false,
          baseUnit: material.baseUnit ?? "",
          secondaryUnit: material.secondaryUnit ?? "",
          uomConversionFactor: material.uomConversionFactor == null ? "" : String(material.uomConversionFactor),
          description: material.description ?? "",
        }
      : empty,
  );
  const [saving, setSaving] = useState(false);
  // Local copy so a freshly created category appears in the dropdown without
  // waiting for router.refresh.
  const [localCategories, setLocalCategories] = useState<MaterialCategory[]>(categories);
  useEffect(() => { setLocalCategories(categories); }, [categories]);

  const isEdit = material != null;

  // Sync form fields when the edit target changes or the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setForm(
      material
        ? {
            code: material.code,
            name: material.name,
            grade: material.grade ?? "",
            specification: material.specification ?? "",
            categoryId: material.categoryId ?? "",
            unit: material.unit,
            hsnCode: material.hsnCode ?? "",
            gstRate: String(material.gstRate),
            standardCost: String(material.standardCost),
            minStock: material.minStock == null ? "" : String(material.minStock),
            reorderPoint: material.reorderPoint == null ? "" : String(material.reorderPoint),
            economicOrderQty: material.economicOrderQty == null ? "" : String(material.economicOrderQty),
            volumetricDensity: material.volumetricDensity == null ? "" : String(material.volumetricDensity),
            bulkDiscountPct: material.bulkDiscountPct == null ? "" : String(material.bulkDiscountPct),
            isCorporateCommodity: material.isCorporateCommodity ?? false,
            isLotTracked: material.isLotTracked ?? false,
            isScrap: material.isScrap ?? false,
            baseUnit: material.baseUnit ?? "",
            secondaryUnit: material.secondaryUnit ?? "",
            uomConversionFactor: material.uomConversionFactor == null ? "" : String(material.uomConversionFactor),
            description: material.description ?? "",
          }
        : empty,
    );
  }, [open, material]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.error("Material code is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Material name is required");
      return;
    }
    if (!form.unit.trim()) {
      toast.error("Unit is required");
      return;
    }
    if (!form.categoryId) {
      toast.error("Please select a category");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        grade: form.grade.trim() || null,
        specification: form.specification.trim() || null,
        categoryId: form.categoryId,
        unit: form.unit.trim(),
        hsnCode: form.hsnCode.trim() || null,
        gstRate: Number(form.gstRate) || 0,
        standardCost: Number(form.standardCost) || 0,
        minStock: form.minStock.trim() === "" ? null : Number(form.minStock),
        reorderPoint: form.reorderPoint.trim() === "" ? null : Number(form.reorderPoint),
        economicOrderQty: form.economicOrderQty.trim() === "" ? null : Number(form.economicOrderQty),
        volumetricDensity: form.volumetricDensity.trim() === "" ? null : Number(form.volumetricDensity),
        bulkDiscountPct: form.bulkDiscountPct.trim() === "" ? null : Number(form.bulkDiscountPct),
        isCorporateCommodity: form.isCorporateCommodity,
        isLotTracked: form.isLotTracked,
        isScrap: form.isScrap,
        baseUnit: form.baseUnit.trim() || null,
        secondaryUnit: form.secondaryUnit.trim() || null,
        uomConversionFactor: form.uomConversionFactor.trim() === "" ? null : Number(form.uomConversionFactor),
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
      title={isEdit ? "Edit Material" : "New Material"}
      description={isEdit ? "Update material details." : "Add a new material to your catalogue."}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <div className="flex gap-2">
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="CEM-OPC53"
                required
                disabled={isEdit}
              />
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={async () => {
                    if (!form.categoryId) {
                      toast.error("Select a category first");
                      return;
                    }
                    const cat = localCategories.find((c) => c.id === form.categoryId);
                    if (!cat) return;
                    try {
                      const res = await fetch("/api/materials/auto-code", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ categoryName: cat.name, grade: form.grade.trim() || null }),
                      });
                      const data = await res.json();
                      if (res.ok && data.code) {
                        set("code", data.code);
                        toast.success(`Auto-generated: ${data.code}`);
                      } else {
                        toast.error(data.error ?? "Failed to generate code");
                      }
                    } catch {
                      toast.error("Failed to generate code");
                    }
                  }}
                >
                  Auto
                </Button>
              )}
            </div>
          </Field>
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Cement OPC 53 Grade"
              required
            />
          </Field>
          <Field label="Grade" hint="Used for auto-code generation (e.g. Fe500D, OPC 53, 20mm)">
            <Input
              value={form.grade}
              onChange={(e) => set("grade", e.target.value)}
              placeholder="Fe500D / OPC 53 / 20mm"
            />
          </Field>
          <Field label="Specification">
            <Input
              value={form.specification}
              onChange={(e) => set("specification", e.target.value)}
              placeholder="IS 1786 / IS 269"
            />
          </Field>
          <Field label="Category" required>
            <SelectWithCreate
              value={form.categoryId ?? ""}
              onChange={(v) => set("categoryId", v)}
              required
              placeholder="Select category…"
              createLabel="category"
              options={localCategories.map((c) => ({ value: c.id, label: c.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <CategoryFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalCategories((p) => [...p, { id: e.id, name: e.label ?? "", unit: "NOS" }]); onCreated(e); }} category={null} />
              )}
            />
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
            <HsnSacSearch
              value={form.hsnCode}
              onCodeChange={(code) => set("hsnCode", code)}
              onGstRateChange={(rate) => set("gstRate", String(rate))}
              placeholder="Search or type HSN/SAC code…"
              materialName={form.name}
              categoryName={localCategories.find((c) => c.id === form.categoryId)?.name}
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
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.standardCost}
                onChange={(e) => set("standardCost", e.target.value)}
                className="flex-1"
              />
              {material && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/materials/${material.id}/last-purchase`);
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
                      if (data.unitCost > 0) {
                        set("standardCost", String(data.unitCost));
                        const srcLabel = data.source === "receipt"
                          ? `last PO ${data.poNumber ?? ""} (${new Date(data.date).toLocaleDateString()})`
                          : data.source === "standard"
                            ? "existing standard cost"
                            : "";
                        toast.success(`Pulled ₹${data.unitCost} from ${srcLabel}`);
                      } else {
                        toast.info("No previous purchase found for this material");
                      }
                    } catch {
                      toast.error("Could not fetch last purchase price");
                    }
                  }}
                >
                  Pull last purchase
                </Button>
              )}
            </div>
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
          <Field label="Reorder Point">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.reorderPoint}
              onChange={(e) => set("reorderPoint", e.target.value)}
              placeholder="Auto-indent trigger level"
            />
          </Field>
          <Field label="Economic Order Qty (EOQ)">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.economicOrderQty}
              onChange={(e) => set("economicOrderQty", e.target.value)}
              placeholder="Optimal order quantity"
            />
          </Field>
          <Field label="Volumetric Density (V/W ratio)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.volumetricDensity}
              onChange={(e) => set("volumetricDensity", e.target.value)}
              placeholder="LCI logistics input"
            />
          </Field>
          <Field label="Bulk Discount (%)">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.bulkDiscountPct}
              onChange={(e) => set("bulkDiscountPct", e.target.value)}
              placeholder="Corporate volume discount"
            />
          </Field>
          <Field label="Corporate Commodity">
            <label className="flex h-9 items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={form.isCorporateCommodity}
                onChange={(e) => set("isCorporateCommodity", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-muted-foreground">Force central procurement</span>
            </label>
          </Field>
          <Field label="Lot Tracked">
            <label className="flex h-9 items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={form.isLotTracked}
                onChange={(e) => set("isLotTracked", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-muted-foreground">Enable batch/lot compliance</span>
            </label>
          </Field>
          <Field label="Scrap Material">
            <label className="flex h-9 items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={form.isScrap}
                onChange={(e) => set("isScrap", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-muted-foreground">Internally generated / by-product</span>
            </label>
          </Field>
        </div>
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">UOM Conversion (optional)</p>
          <p className="text-xs text-muted-foreground mb-2">Convert between base and secondary units (e.g. 1 BAG = 50 KG). Enables quantity entry in either unit during goods receipt.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Base Unit">
              <Input value={form.baseUnit} onChange={(e) => set("baseUnit", e.target.value)} placeholder="e.g. KG" />
            </Field>
            <Field label="Secondary Unit">
              <Input value={form.secondaryUnit} onChange={(e) => set("secondaryUnit", e.target.value)} placeholder="e.g. BAG" />
            </Field>
            <Field label="1 secondary = N base">
              <Input type="number" step="0.000001" min="0" value={form.uomConversionFactor} onChange={(e) => set("uomConversionFactor", e.target.value)} placeholder="e.g. 50" />
            </Field>
          </div>
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
