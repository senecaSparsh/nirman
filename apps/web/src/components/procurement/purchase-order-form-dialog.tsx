"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { formatCurrency } from "@/lib/utils";
import { required, type ValidationErrors } from "@/lib/validate";
import type { MaterialCategory, MaterialRow, ProjectOption, StockLocationRow, SupplierRow } from "@/lib/types";

type PoFormValues = {
  supplierId: string;
  lines: Line[];
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

type Line = {
  key: string;
  materialId: string;
  qtyOrdered: string;
  unitCost: string;
  gstRate: string;
};

let lineKey = 0;
function newLine(): Line {
  return { key: `l${++lineKey}`, materialId: "", qtyOrdered: "", unitCost: "", gstRate: "0" };
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  suppliers,
  materials,
  locations,
  projects,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  categories: MaterialCategory[];
}) {
  // Local copy of materials so a newly created material shows up in the line
  // item dropdown immediately, without waiting for router.refresh.
  const [localMaterials, setLocalMaterials] = useState<MaterialRow[]>(materials);
  useEffect(() => { setLocalMaterials(materials); }, [materials]);

  // Build material options for the select column
  const materialOptions = useMemo(
    () => localMaterials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [localMaterials],
  );

  // Column definitions for the editable grid
  const lineColumns: EditableColumn<Line>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select material…",
      width: "1fr",
      createLabel: "material",
    },
    {
      key: "qtyOrdered",
      label: "Qty",
      type: "number",
      align: "right",
      step: "0.001",
      min: 0,
      placeholder: "0",
      width: "90px",
      format: (v) => v ? String(v) : "",
    },
    {
      key: "unitCost",
      label: "Rate (₹)",
      type: "number",
      align: "right",
      step: "0.01",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatCurrency(Number(v)) : "",
    },
    {
      key: "gstRate",
      label: "GST %",
      type: "number",
      align: "right",
      step: "0.01",
      min: 0,
      max: 100,
      placeholder: "0",
      width: "80px",
      format: (v) => v ? `${v}%` : "",
    },
    {
      key: "lineTotal",
      label: "Amount",
      type: "computed",
      align: "right",
      compute: (r) => (Number(r.qtyOrdered) || 0) * (Number(r.unitCost) || 0),
      format: (v) => formatCurrency(v as number),
    },
  ], [materialOptions]);
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [scope, setScope] = useState<"COMPANY" | "PROJECT">("COMPANY");
  const [projectId, setProjectId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLinesState] = useState<Line[]>([newLine()]);

  // Wrap setLines to auto-fill gstRate & unitCost from the selected material.
  function setLines(updater: Line[] | ((prev: Line[]) => Line[])) {
    setLinesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // For each line, if materialId changed, auto-fill gstRate & unitCost.
      return next.map((line, i) => {
        const prevLine = prev[i];
        if (line.materialId && line.materialId !== prevLine?.materialId) {
          const mat = localMaterials.find((m) => m.id === line.materialId);
          if (mat) {
            return {
              ...line,
              gstRate: line.gstRate === "0" || !line.gstRate ? String(mat.gstRate) : line.gstRate,
              unitCost: !line.unitCost ? String(mat.standardCost) : line.unitCost,
            };
          }
        }
        return line;
      });
    });
  }
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors<PoFormValues>>({});
  // Inline create dialog open-state for the master selects.
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [locationCreateOpen, setLocationCreateOpen] = useState(false);
  const [materialCreateOpen, setMaterialCreateOpen] = useState(false);
  // Local copies so a freshly created master shows up in its select without
  // waiting for router.refresh.
  const [localSuppliers, setLocalSuppliers] = useState<SupplierRow[]>(suppliers);
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  const [localLocations, setLocalLocations] = useState<StockLocationRow[]>(locations);
  useEffect(() => { setLocalSuppliers(suppliers); }, [suppliers]);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalLocations(locations); }, [locations]);

  function validateField(key: keyof PoFormValues): string | undefined {
    if (key === "supplierId") return required(supplierId, "Supplier");
    if (key === "lines") {
      const validLines = lines.filter((l) => l.materialId && Number(l.qtyOrdered) > 0);
      if (validLines.length === 0) return "Add at least one line item with a material and quantity";
    }
  }

  function onBlur(key: keyof PoFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  // Filter locations by scope
  const availableLocations = localLocations.filter((l) =>
    scope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
  );
  // For PROJECT scope, further filter by selected project
  const projectLocations =
    scope === "PROJECT" && projectId
      ? availableLocations.filter((l) => l.projectId === projectId)
      : availableLocations;

  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }

  // Compute totals
  const computed = lines.reduce(
    (acc, l) => {
      const qty = Number(l.qtyOrdered) || 0;
      const cost = Number(l.unitCost) || 0;
      const gst = Number(l.gstRate) || 0;
      const sub = qty * cost;
      acc.subtotal += sub;
      acc.gst += (sub * gst) / 100;
      return acc;
    },
    { subtotal: 0, gst: 0 },
  );
  const total = computed.subtotal + computed.gst;

  function onScopeChange(s: "COMPANY" | "PROJECT") {
    setScope(s);
    setLocationId("");
    setProjectId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<PoFormValues> = {};
    (["supplierId", "lines"] as (keyof PoFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (!locationId) { toast.error("Select a destination location"); return; }
    if (scope === "PROJECT" && !projectId) { toast.error("Select a project for PROJECT-scope PO"); return; }
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }

    const validLines = lines.filter((l) => l.materialId && Number(l.qtyOrdered) > 0);
    setSaving(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          procurementScope: scope,
          projectId: scope === "PROJECT" ? projectId : null,
          destinationLocationId: locationId,
          expectedDate: expectedDate || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyOrdered: Number(l.qtyOrdered),
            unitCost: Number(l.unitCost) || 0,
            gstRate: Number(l.gstRate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create PO");
      toast.success(`PO ${data.poNumber} created`);
      onOpenChange(false);
      // Reset form
      setSupplierId(""); setLocationId(""); setProjectId(""); setExpectedDate(""); setNotes("");
      setLinesState([newLine()]);
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
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          // Default expected date to today + 7 days
          setExpectedDate((cur) => cur || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
        } else {
          setSupplierId(""); setLocationId(""); setProjectId(""); setScope("COMPANY");
          setExpectedDate(""); setNotes(""); setLinesState([newLine()]); setErrors({});
        }
      }}
      title="New Purchase Order"
      description="Create a PO with COMPANY or PROJECT scope. COMPANY → receive at company warehouse; PROJECT → receive at project site."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Header fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" required error={errors.supplierId}>
            <SelectWithCreate
              value={supplierId}
              onChange={setSupplierId}
              onBlur={() => onBlur("supplierId")}
              required
              aria-invalid={!!errors.supplierId}
              className={errors.supplierId ? errorBorder : undefined}
              placeholder="Select supplier…"
              createLabel="supplier"
              options={localSuppliers.map((s) => ({ value: s.id, label: s.balanceOwed > 0 ? `${s.name} (Owes: ${formatCurrency(s.balanceOwed)})` : s.name }))}
              renderCreateDialog={({ open, onCreated, onClose }) => (
                <SupplierFormDialog open={open} onOpenChange={onClose} onCreated={(e) => { setLocalSuppliers((p) => [...p, { ...({} as SupplierRow), id: e.id, name: e.label ?? "" }]); onCreated(e); }} supplier={null} existingSuppliers={localSuppliers} />
              )}
            />
          </Field>
          <Field label="Procurement Scope" required>
            <Select value={scope} onChange={(e) => onScopeChange(e.target.value as "COMPANY" | "PROJECT")}>
              <option value="COMPANY">Company (central warehouse)</option>
              <option value="PROJECT">Project (direct to site)</option>
            </Select>
          </Field>
          {scope === "PROJECT" && (
            <Field label="Project" required>
              <SelectWithCreate
                value={projectId}
                onChange={(v) => { setProjectId(v); setLocationId(""); }}
                required
                placeholder="Select project…"
                createLabel="project"
                options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
                renderCreateDialog={({ open, onCreated, onClose }) => (
                  <ProjectFormDialog open={open} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
                )}
              />
            </Field>
          )}
          <Field label="Destination Location" required>
            <SelectWithCreate
              value={locationId}
              onChange={setLocationId}
              required
              placeholder="Select location…"
              createLabel="location"
              options={projectLocations.map((l) => ({ value: l.id, label: l.name }))}
              renderCreateDialog={({ open, onCreated, onClose }) => (
                <LocationFormDialog open={open} onOpenChange={onClose} onCreated={(e) => { setLocalLocations((p) => [...p, { ...({} as StockLocationRow), id: e.id, name: e.label ?? "", type: scope === "PROJECT" ? "PROJECT_SITE" : "COMPANY_WAREHOUSE", projectId: scope === "PROJECT" ? projectId : null }]); onCreated(e); }} projects={localProjects} location={null} />
              )}
            />
          </Field>
          <Field label="Expected Date">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        {/* Supplier outstanding balance context */}
        {(() => {
          const sel = localSuppliers.find((s) => s.id === supplierId);
          if (!sel || sel.balanceOwed <= 0) return null;
          return (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-caption text-muted-foreground">
              ⚠ <span className="font-medium text-foreground">{sel.name}</span> has an outstanding balance of{" "}
              <span className="tnum font-medium text-foreground">{formatCurrency(sel.balanceOwed)}</span>.
              {sel.openPOs > 0 && <span className="ml-1">({sel.openPOs} open PO{sel.openPOs === 1 ? "" : "s"})</span>}
            </div>
          );
        })()}

        {/* Line items — editable grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line Items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className={`rounded-lg border overflow-hidden ${errors.lines ? "border-danger" : "border-border"}`}>
            <EditableGrid
              rows={lines}
              onChange={setLines}
              columns={lineColumns}
              getRowId={(r) => r.key}
              sumColumns={["qtyOrdered", "lineTotal"]}
              className="max-h-[40vh]"
              onCreateOption={() => setMaterialCreateOpen(true)}
            />
          </div>
          {errors.lines && <p className="text-caption text-danger" role="alert">{errors.lines}</p>}
        </div>

        {/* Totals */}
        <div className="flex justify-end gap-6 rounded-md bg-muted/40 px-4 py-2 text-body">
          <span className="tnum">Subtotal: <strong>{formatCurrency(computed.subtotal)}</strong></span>
          <span className="tnum">GST: <strong>{formatCurrency(computed.gst)}</strong></span>
          <span className="tnum">Total: <strong>{formatCurrency(total)}</strong></span>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes for this PO" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create PO"}</Button>
        </div>
      </form>

      {/* Inline material creator — opened from a line item's "+ Create new
          material…" option. The new material is spliced into the dropdown. */}
      <MaterialFormDialog
        open={materialCreateOpen}
        onOpenChange={setMaterialCreateOpen}
        categories={categories}
        material={null}
        onCreated={(e) => {
          setLocalMaterials((p) => [
            ...p,
            { ...({} as MaterialRow), id: e.id, name: e.label ?? "", code: "" },
          ]);
        }}
      />
    </Dialog>
  );
}
