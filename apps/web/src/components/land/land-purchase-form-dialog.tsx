"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { required, positiveNumber, type ValidationErrors } from "@/lib/validate";
import type { ProjectOption, LandPurchaseRow } from "@/lib/types";

type LandFormValues = {
  initialParcelNumber: string;
  totalArea: string;
  totalCost: string;
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

/** The subset of a LandPurchaseRow needed to populate the edit form. */
export type LandPurchaseEditInitial = Pick<
  LandPurchaseRow,
  "id" | "projectId" | "sellerName" | "sellerContact" | "purchaseDate" |
  "totalArea" | "areaUnit" | "totalCost" | "registryNo" | "location"
>;

export function LandPurchaseFormDialog({
  open,
  onOpenChange,
  projects,
  editing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  editing?: LandPurchaseEditInitial | null;
  onCreated?: (purchaseId: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    sellerName: "",
    sellerContact: "",
    purchaseDate: "",
    totalArea: "",
    areaUnit: "SQFT",
    totalCost: "",
    registryNo: "",
    location: "",
    initialParcelNumber: "",
  });
  const [errors, setErrors] = useState<ValidationErrors<LandFormValues>>({});

  function validateField(key: keyof LandFormValues): string | undefined {
    if (key === "initialParcelNumber") return required(form.initialParcelNumber, "Parcel number");
    if (key === "totalArea") return required(form.totalArea, "Total area") ?? positiveNumber(form.totalArea, "Total area");
    if (key === "totalCost") return required(form.totalCost, "Total cost") ?? positiveNumber(form.totalCost, "Total cost");
  }

  function onBlur(key: keyof LandFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  // Populate form when editing
  useEffect(() => {
    if (open) setErrors({});
    if (open && editing) {
      setForm({
        projectId: editing.projectId ?? "",
        sellerName: editing.sellerName ?? "",
        sellerContact: editing.sellerContact ?? "",
        purchaseDate: editing.purchaseDate ? editing.purchaseDate.slice(0, 10) : "",
        totalArea: String(editing.totalArea ?? ""),
        areaUnit: editing.areaUnit ?? "SQFT",
        totalCost: String(editing.totalCost ?? ""),
        registryNo: editing.registryNo ?? "",
        location: editing.location ?? "",
        initialParcelNumber: "",
      });
    } else if (open && !editing) {
      setForm({ projectId: "", sellerName: "", sellerContact: "", purchaseDate: "", totalArea: "", areaUnit: "SQFT", totalCost: "", registryNo: "", location: "", initialParcelNumber: "" });
    }
  }, [open, editing]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sellerName.trim()) return toast.error("Seller name is required");
    const newErrors: ValidationErrors<LandFormValues> = {};
    (["initialParcelNumber", "totalArea", "totalCost"] as (keyof LandFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId || null,
        sellerName: form.sellerName.trim(),
        sellerContact: form.sellerContact.trim() || null,
        purchaseDate: form.purchaseDate || null,
        totalArea: Number(form.totalArea),
        areaUnit: form.areaUnit,
        totalCost: Number(form.totalCost),
        registryNo: form.registryNo.trim() || null,
        location: form.location.trim() || null,
        ...(editing ? {} : { initialParcelNumber: form.initialParcelNumber.trim() || undefined }),
      };
      const res = await fetch(
        editing ? `/api/land-purchases/${editing.id}` : "/api/land-purchases",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save land purchase");
      if (editing) {
        toast.success("Land purchase updated");
      } else {
        toast.success("Land purchase recorded", {
          description: "An initial parcel covers the full area. You can subdivide it into sellable sub-plots.",
        });
        if (onCreated && data.id) onCreated(data.id);
      }
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? "Edit Land Purchase" : "Record Land Purchase"} description={editing ? "Update land purchase details." : "A land purchase creates an initial parcel covering the full area. After recording, you can subdivide it into smaller sellable plots or keep it as a single whole plot."} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Project (optional)</Label>
          <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">No project — standalone land</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Seller Name *</Label>
            <Input value={form.sellerName} onChange={(e) => set("sellerName", e.target.value)} placeholder="e.g. Suresh Patel" required />
          </div>
          <div className="space-y-1.5">
            <Label>Seller Contact</Label>
            <Input value={form.sellerContact} onChange={(e) => set("sellerContact", e.target.value)} placeholder="98765 43210" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className={errors.totalArea ? "text-danger" : undefined}>Total Area *</Label>
            <Input type="number" min={0} step="any" value={form.totalArea} onChange={(e) => set("totalArea", e.target.value)} onBlur={() => onBlur("totalArea")} placeholder="e.g. 12000" required aria-invalid={!!errors.totalArea} className={errors.totalArea ? errorBorder : undefined} />
            {errors.totalArea && <p className="text-caption text-danger" role="alert">{errors.totalArea}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={form.areaUnit} onChange={(e) => set("areaUnit", e.target.value)}>
              <option value="SQFT">Sq.Ft</option>
              <option value="SQM">Sq.Mtr</option>
              <option value="SQYD">Sq.Yard</option>
              <option value="ACRE">Acre</option>
              <option value="BIGHA">Bigha</option>
              <option value="KATHA">Katha</option>
              <option value="HECTARE">Hectare</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className={errors.totalCost ? "text-danger" : undefined}>Total Cost (₹) *</Label>
          <Input type="number" min={0} step="any" value={form.totalCost} onChange={(e) => set("totalCost", e.target.value)} onBlur={() => onBlur("totalCost")} placeholder="e.g. 5000000" required aria-invalid={!!errors.totalCost} className={errors.totalCost ? errorBorder : undefined} />
          {errors.totalCost && <p className="text-caption text-danger" role="alert">{errors.totalCost}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Registry No.</Label>
            <Input value={form.registryNo} onChange={(e) => set("registryNo", e.target.value)} placeholder="Sale deed / registry number" />
          </div>
          <div className="space-y-1.5">
            <Label>Purchase Date</Label>
            <Input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Textarea value={form.location} onChange={(e) => set("location", e.target.value)} rows={2} placeholder="Village, tehsil, district, state" />
        </div>
        {!editing && (
          <div className="space-y-1.5">
            <Label className={errors.initialParcelNumber ? "text-danger" : undefined}>Initial Parcel Number</Label>
            <Input value={form.initialParcelNumber} onChange={(e) => set("initialParcelNumber", e.target.value)} onBlur={() => onBlur("initialParcelNumber")} placeholder="PLOT-1 (default)" aria-invalid={!!errors.initialParcelNumber} className={errors.initialParcelNumber ? errorBorder : undefined} />
            {errors.initialParcelNumber && <p className="text-caption text-danger" role="alert">{errors.initialParcelNumber}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Record Purchase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
