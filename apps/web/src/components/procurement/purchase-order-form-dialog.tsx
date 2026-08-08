"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency } from "@/lib/utils";
import { required, type ValidationErrors } from "@/lib/validate";
import type { MaterialRow, ProjectOption, StockLocationRow, SupplierRow } from "@/lib/types";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
}) {
  // Build material options for the select column
  const materialOptions = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [materials],
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
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors<PoFormValues>>({});

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
  const availableLocations = locations.filter((l) =>
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
      setLines([newLine()]);
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
        if (!o) {
          setSupplierId(""); setLocationId(""); setProjectId(""); setScope("COMPANY");
          setExpectedDate(""); setNotes(""); setLines([newLine()]); setErrors({});
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
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} onBlur={() => onBlur("supplierId")} required aria-invalid={!!errors.supplierId} className={errors.supplierId ? errorBorder : undefined}>
              <option value="" disabled>Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Procurement Scope" required>
            <Select value={scope} onChange={(e) => onScopeChange(e.target.value as "COMPANY" | "PROJECT")}>
              <option value="COMPANY">Company (central warehouse)</option>
              <option value="PROJECT">Project (direct to site)</option>
            </Select>
          </Field>
          {scope === "PROJECT" && (
            <Field label="Project" required>
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLocationId(""); }} required>
                <option value="" disabled>Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Destination Location" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              <option value="" disabled>Select location…</option>
              {projectLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expected Date">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

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
    </Dialog>
  );
}
