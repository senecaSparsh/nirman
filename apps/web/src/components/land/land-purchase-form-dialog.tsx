"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Upload, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
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
  "totalArea" | "areaUnit" | "totalCost" | "registryNo" | "location" | "documentUrl"
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
  onCreated?: (purchaseId: string, rootParcel?: { id: string; number: string; area: number; areaUnit: string; acquisitionCost: number }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>("");
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
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
      setDocumentUrl(editing.documentUrl ?? null);
      setDocumentName(editing.documentUrl ? editing.documentUrl.split("/").pop() ?? "" : "");
    } else if (open && !editing) {
      setForm({ projectId: "", sellerName: "", sellerContact: "", purchaseDate: "", totalArea: "", areaUnit: "SQFT", totalCost: "", registryNo: "", location: "", initialParcelNumber: "" });
      setDocumentUrl(null);
      setDocumentName("");
    }
  }, [open, editing]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDocumentUrl(data.url);
      setDocumentName(data.fileName);
      toast.success("Document uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeDocument() {
    setDocumentUrl(null);
    setDocumentName("");
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
        documentUrl: documentUrl,
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
        onOpenChange(false);
        router.refresh();
      } else {
        toast.success("Land purchase recorded", {
          description: "An initial parcel covers the full area. You can subdivide it into sellable sub-plots.",
        });
        // Call onCreated BEFORE closing — the parent may need to show a
        // subdivide prompt. We skip router.refresh() here because it would
        // re-suspend the server boundary and unmount the parent (losing
        // the subdividePrompt state). The parent handles refresh after the
        // subdivide flow completes.
        if (onCreated && data.id) onCreated(data.id, data.rootParcelId ? {
          id: data.rootParcelId,
          number: data.rootParcelNumber,
          area: data.rootParcelArea,
          areaUnit: data.rootParcelAreaUnit,
          acquisitionCost: data.rootParcelAcquisitionCost,
        } : undefined);
        onOpenChange(false);
      }
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
          <SelectWithCreate
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            placeholder="No project — standalone land"
            createLabel="project"
            options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
            renderCreateDialog={({ open: o, onCreated, onClose }) => (
              <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
            )}
          />
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
        <div className="space-y-1.5">
          <Label>Document</Label>
          {documentUrl ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <a href={documentUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-body text-foreground underline underline-offset-2 hover:text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{documentName || "View document"}</span>
              </a>
              <button type="button" onClick={removeDocument} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Remove">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-caption text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload sale deed / registry document"}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" />
            </label>
          )}
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
