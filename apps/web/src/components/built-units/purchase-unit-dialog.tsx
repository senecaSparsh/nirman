"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ShoppingCart, Plus, Trash2, Copy, AlertCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { formatCurrency } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";

type BuiltUnitType = "BHK_1" | "BHK_2" | "BHK_3" | "BHK_4" | "SHOP" | "OFFICE" | "WAREHOUSE_UNIT" | "VILLA" | "OTHER";
type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";

const UNIT_TYPES: { value: BuiltUnitType; label: string }[] = [
  { value: "BHK_1", label: "1 BHK" },
  { value: "BHK_2", label: "2 BHK" },
  { value: "BHK_3", label: "3 BHK" },
  { value: "BHK_4", label: "4 BHK" },
  { value: "SHOP", label: "Shop" },
  { value: "OFFICE", label: "Office" },
  { value: "WAREHOUSE_UNIT", label: "Warehouse Unit" },
  { value: "VILLA", label: "Villa" },
  { value: "OTHER", label: "Other" },
];

const AREA_UNITS: { value: AreaUnit; label: string }[] = [
  { value: "SQFT", label: "sq ft" },
  { value: "SQM", label: "sq m" },
  { value: "SQYD", label: "sq yd" },
  { value: "ACRE", label: "acre" },
  { value: "BIGHA", label: "bigha" },
  { value: "KATHA", label: "katha" },
  { value: "HECTARE", label: "hectare" },
];

type PurchaseRow = {
  id: string;
  unitType: BuiltUnitType;
  unitNumber: string;
  floor: string;
  wing: string;
  area: string;
  areaUnit: AreaUnit;
  acquisitionCost: string;
  askingPrice: string;
};

function emptyRow(): PurchaseRow {
  return {
    id: crypto.randomUUID(),
    unitType: "BHK_2",
    unitNumber: "",
    floor: "",
    wing: "",
    area: "",
    areaUnit: "SQFT",
    acquisitionCost: "",
    askingPrice: "",
  };
}

export function PurchaseUnitDialog({
  open,
  onOpenChange,
  projects,
  onPurchased,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  onPurchased?: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<PurchaseRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  // Local copy of projects so freshly created ones appear without a refresh
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  // ── Sequential unit generator state ──
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrefix, setGenPrefix] = useState("U-");
  const [genStart, setGenStart] = useState("1");
  const [genCount, setGenCount] = useState("5");

  useEffect(() => {
    if (open) {
      setProjectId(projects[0]?.id ?? "");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setRows([emptyRow()]);
      setShowGenerator(false);
    }
  }, [open, projects]);

  function addRow() {
    setRows((r) => [...r, emptyRow()]);
  }

  function duplicateRow(idx: number) {
    setRows((r) => {
      const src = r[idx];
      if (!src) return r;
      const copy: PurchaseRow = { ...src, id: crypto.randomUUID(), unitNumber: "" };
      return [...r.slice(0, idx + 1), copy, ...r.slice(idx + 1)];
    });
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, key: keyof PurchaseRow, value: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const key = r.unitNumber.trim().toLowerCase();
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }, [rows]);

  const hasDuplicates = duplicateNumbers.size > 0;

  // Total acquisition cost preview
  const totalCost = rows.reduce((s, r) => s + (Number(r.acquisitionCost) || 0), 0);

  function generateSequential() {
    const start = parseInt(genStart) || 1;
    const count = parseInt(genCount) || 1;
    if (count <= 0 || count > 200) {
      toast.error("Count must be between 1 and 200");
      return;
    }
    const baseUnit = rows[0] ?? emptyRow();
    const newRows: PurchaseRow[] = [];
    for (let i = 0; i < count; i++) {
      const num = start + i;
      newRows.push({
        ...baseUnit,
        id: crypto.randomUUID(),
        unitNumber: `${genPrefix}${num}`,
        askingPrice: "",
      });
    }
    setRows(newRows);
    setShowGenerator(false);
    toast.success(`Generated ${count} units (${newRows[0]?.unitNumber} – ${newRows[newRows.length - 1]?.unitNumber})`);
  }

  const handleSubmit = async () => {
    if (!projectId) { toast.error("Select a project"); return; }
    if (rows.length === 0) { toast.error("Add at least one unit"); return; }
    if (hasDuplicates) { toast.error("Duplicate unit numbers — fix before saving"); return; }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (!r.unitNumber.trim()) { toast.error(`Unit number is required for row ${i + 1}`); return; }
      if (!r.area || Number(r.area) <= 0) { toast.error(`Area must be > 0 for row ${i + 1}`); return; }
      if (!r.acquisitionCost || Number(r.acquisitionCost) <= 0) { toast.error(`Acquisition cost must be > 0 for row ${i + 1}`); return; }
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        projectId,
        unitType: r.unitType,
        unitNumber: r.unitNumber.trim(),
        floor: r.floor ? parseInt(r.floor) : null,
        wing: r.wing.trim() || null,
        area: Number(r.area),
        areaUnit: r.areaUnit,
        acquisitionCost: Number(r.acquisitionCost),
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
        askingPrice: r.askingPrice ? parseFloat(r.askingPrice) : null,
        notes: notes.trim() || undefined,
      }));
      const res = await fetch("/api/built-units/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to purchase unit(s)");
        return;
      }
      if (rows.length === 1) {
        toast.success(`Unit ${data.unitNumber} purchased for ${formatCurrency(data.acquisitionCost)}`);
      } else {
        toast.success(`${rows.length} units purchased for ${formatCurrency(totalCost)}`);
      }
      onOpenChange(false);
      onPurchased?.();
    } catch {
      toast.error("Failed to purchase unit(s)");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Purchase Units"
      description="Record buying existing units (flats, shops, offices). Units start as Available with the acquisition cost as their cost basis."
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || projects.length === 0 || hasDuplicates}>
            {saving ? "Saving…" : <><ShoppingCart className="h-4 w-4 mr-1" /> Purchase {rows.length} Unit{rows.length !== 1 ? "s" : ""}</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Project + shared fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <SelectWithCreate
              value={projectId}
              onChange={setProjectId}
              placeholder="Select project…"
              createLabel="project"
              options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
              )}
            />
          </Field>
          <Field label="Purchase Date (all units)">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
        </div>

        {/* Unit rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-body font-medium">Units</p>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowGenerator((s) => !s)} disabled={saving}
                className="text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Generate range
                {showGenerator ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={saving}>
                <Plus className="h-3.5 w-3.5" /> Add Unit
              </Button>
            </div>
          </div>

          {/* Sequential generator panel */}
          {showGenerator && (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-2.5 text-caption text-muted-foreground">
                Generate sequential unit numbers (e.g. U-1, U-2, U-3…). Each gets the same type/area/cost from the first row.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-caption">Prefix</Label>
                  <Input value={genPrefix} onChange={(e) => setGenPrefix(e.target.value)} placeholder="U-" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Start No.</Label>
                  <Input type="number" value={genStart} onChange={(e) => setGenStart(e.target.value)} placeholder="1" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Count</Label>
                  <Input type="number" value={genCount} onChange={(e) => setGenCount(e.target.value)} placeholder="5" className="h-8 text-xs" />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-micro text-muted-foreground">
                  Preview: <span className="tnum font-medium text-foreground">
                    {genPrefix}{genStart || "1"} – {genPrefix}{(parseInt(genStart) || 1) + (parseInt(genCount) || 1) - 1}
                  </span>
                </span>
                <Button type="button" size="sm" onClick={generateSequential} disabled={saving}>
                  <Sparkles className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
            </div>
          )}

          {hasDuplicates && (
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Duplicate unit numbers detected — each unit number must be unique.
            </div>
          )}

          {rows.map((row, idx) => {
            const isDup = duplicateNumbers.has(row.unitNumber.trim().toLowerCase());
            return (
              <div key={row.id} className="rounded-md border border-border bg-muted/20 p-2.5">
                {/* Row 1: type, unit number, floor, wing */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-caption">Type</Label>
                    <Select
                      value={row.unitType}
                      onChange={(e) => updateRow(idx, "unitType", e.target.value)}
                      className="h-8 text-xs"
                    >
                      {UNIT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-caption">Unit No. *</Label>
                    <Input
                      value={row.unitNumber}
                      onChange={(e) => updateRow(idx, "unitNumber", e.target.value)}
                      placeholder="A-101"
                      className={`h-8 text-xs ${isDup ? "border-warning focus-visible:ring-warning" : ""}`}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-caption">Floor</Label>
                    <Input
                      type="number"
                      value={row.floor}
                      onChange={(e) => updateRow(idx, "floor", e.target.value)}
                      placeholder="1"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-caption">Wing</Label>
                    <Input
                      value={row.wing}
                      onChange={(e) => updateRow(idx, "wing", e.target.value)}
                      placeholder="A"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end gap-0.5">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateRow(idx)} disabled={saving} title="Duplicate row" aria-label="Duplicate row">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(idx)} disabled={saving} title="Remove row" aria-label="Remove row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Row 2: area, acquisition cost, asking price */}
                <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-caption">Area *</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={row.area}
                        onChange={(e) => updateRow(idx, "area", e.target.value)}
                        placeholder="1200"
                        className="h-8 text-xs"
                      />
                      <Select
                        value={row.areaUnit}
                        onChange={(e) => updateRow(idx, "areaUnit", e.target.value as AreaUnit)}
                        className="h-8 w-20 shrink-0 text-xs"
                      >
                        {AREA_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="col-span-4 space-y-1">
                    <Label className="text-caption">Acquisition Cost *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.acquisitionCost}
                      onChange={(e) => updateRow(idx, "acquisitionCost", e.target.value)}
                      placeholder="5000000"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-caption">Asking Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.askingPrice}
                      onChange={(e) => updateRow(idx, "askingPrice", e.target.value)}
                      placeholder="Optional"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total cost preview */}
        {rows.length > 1 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
            <span className="text-caption text-muted-foreground">Total acquisition cost ({rows.length} units)</span>
            <span className="tnum font-medium text-foreground">{formatCurrency(totalCost)}</span>
          </div>
        )}

        <Field label="Notes (optional, applies to all units)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any notes about this purchase…" />
        </Field>
      </div>
    </Dialog>
  );
}
