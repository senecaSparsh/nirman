"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Copy, AlertCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import type { AreaUnit, BuiltUnitType, PhaseOption, ProjectOption } from "@/lib/types";

const UNIT_TYPES: BuiltUnitType[] = [
  "BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER",
];

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK",
  BHK_2: "2 BHK",
  BHK_3: "3 BHK",
  BHK_4: "4 BHK",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE_UNIT: "Warehouse Unit",
  VILLA: "Villa",
  OTHER: "Other",
};

const AREA_UNITS: AreaUnit[] = ["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"];
const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  SQFT: "Sq.Ft",
  SQM: "Sq.Mtr",
  SQYD: "Sq.Yard",
  ACRE: "Acre",
  BIGHA: "Bigha",
  KATHA: "Katha",
  HECTARE: "Hectare",
};

type UnitRow = {
  id: string;
  unitType: BuiltUnitType;
  unitNumber: string;
  floor: string;
  wing: string;
  area: string;
  areaUnit: AreaUnit;
  askingPrice: string;
  phaseId: string;
};

function emptyRow(areaUnit: AreaUnit = "SQFT"): UnitRow {
  return {
    id: crypto.randomUUID(),
    unitType: "BHK_2",
    unitNumber: "",
    floor: "",
    wing: "",
    area: "",
    areaUnit,
    askingPrice: "",
    phaseId: "",
  };
}

export function BuiltUnitFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  /** All phases across the company; filtered by selected project. */
  phases: PhaseOption[];
  /** Pre-fill fields (e.g. { projectId: "abc" } when scoped to a project node). */
  defaults?: { projectId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [rows, setRows] = useState<UnitRow[]>([emptyRow()]);

  // ── Sequential unit generator state ──
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrefix, setGenPrefix] = useState("A-");
  const [genStart, setGenStart] = useState("101");
  const [genCount, setGenCount] = useState("5");
  const [genFloorPerFloor, setGenFloorPerFloor] = useState("4");

  // Phases for the selected project
  const projectPhases = useMemo(
    () => (projectId ? phases.filter((p) => p.projectId === projectId) : []),
    [projectId, phases],
  );

  // Apply defaults + reset when the dialog opens/closes
  useEffect(() => {
    if (open) {
      if (defaults?.projectId) setProjectId(defaults.projectId);
      setRows([emptyRow()]);
      setShowGenerator(false);
    } else {
      // Reset on close so state doesn't leak between opens
      setProjectId("");
      setRows([emptyRow()]);
      setShowGenerator(false);
    }
  }, [open, defaults]);

  function addRow() {
    setRows((r) => [...r, emptyRow(r[0]?.areaUnit ?? "SQFT")]);
  }

  function duplicateRow(idx: number) {
    setRows((r) => {
      const src = r[idx];
      if (!src) return r;
      const copy: UnitRow = {
        ...src,
        id: crypto.randomUUID(),
        unitNumber: "", // don't duplicate the unit number — it must be unique
      };
      return [...r.slice(0, idx + 1), copy, ...r.slice(idx + 1)];
    });
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, key: keyof UnitRow, value: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  // Detect duplicate unit numbers within the batch (client-side UX)
  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const key = r.unitNumber.trim().toLowerCase();
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }, [rows]);

  const hasDuplicates = duplicateNumbers.size > 0;

  function generateSequential() {
    const start = parseInt(genStart) || 1;
    const count = parseInt(genCount) || 1;
    const perFloor = parseInt(genFloorPerFloor) || 0;
    if (count <= 0 || count > 200) {
      toast.error("Count must be between 1 and 200");
      return;
    }
    const baseUnit = rows[0] ?? emptyRow();
    const newRows: UnitRow[] = [];
    for (let i = 0; i < count; i++) {
      const num = start + i;
      const unitNumber = `${genPrefix}${num}`;
      const floor = perFloor > 0 ? Math.floor(i / perFloor) + 1 : null;
      newRows.push({
        ...baseUnit,
        id: crypto.randomUUID(),
        unitNumber,
        floor: floor != null ? String(floor) : "",
        askingPrice: "",
      });
    }
    setRows(newRows);
    setShowGenerator(false);
    toast.success(`Generated ${count} units (${newRows[0]?.unitNumber} – ${newRows[newRows.length - 1]?.unitNumber})`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast.error("Project is required");
      return;
    }
    if (rows.length === 0) {
      toast.error("Add at least one unit");
      return;
    }
    if (hasDuplicates) {
      toast.error("Duplicate unit numbers within the batch — fix before saving");
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (!r.unitNumber.trim()) {
        toast.error(`Unit number is required for row ${i + 1}`);
        return;
      }
      if (!r.area || Number(r.area) <= 0) {
        toast.error(`Area must be > 0 for row ${i + 1}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        projectId,
        phaseId: r.phaseId || null,
        unitType: r.unitType,
        unitNumber: r.unitNumber.trim(),
        floor: r.floor ? Number(r.floor) || null : null,
        wing: r.wing.trim() || null,
        area: Number(r.area) || 0,
        areaUnit: r.areaUnit,
        askingPrice: r.askingPrice ? Number(r.askingPrice) || null : null,
      }));
      const res = await fetch("/api/built-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create units");
      toast.success(`${payload.length} unit${payload.length !== 1 ? "s" : ""} created`, {
        description: "Units start as Planned. Move them to Construction when work begins.",
        action: {
          label: "View Units",
          onClick: () => router.push(`/units?project=${projectId}`),
        },
      });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Built Units"
      description="Create one or more built units for a project."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Project selector */}
        <div className="space-y-1.5">
          <Label htmlFor="bu-project">Project *</Label>
          <Select
            id="bu-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          {projectId && projectPhases.length > 0 && (
            <p className="text-caption text-muted-foreground">
              {projectPhases.length} phase{projectPhases.length !== 1 ? "s" : ""} available — assign per unit below.
            </p>
          )}
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
                Generate sequential unit numbers (e.g. A-101, A-102, A-103…). Floor is auto-assigned based on units per floor.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-caption">Prefix</Label>
                  <Input
                    value={genPrefix}
                    onChange={(e) => setGenPrefix(e.target.value)}
                    placeholder="A-"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Start No.</Label>
                  <Input
                    type="number"
                    value={genStart}
                    onChange={(e) => setGenStart(e.target.value)}
                    placeholder="101"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Count</Label>
                  <Input
                    type="number"
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    placeholder="5"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Units / floor</Label>
                  <Input
                    type="number"
                    value={genFloorPerFloor}
                    onChange={(e) => setGenFloorPerFloor(e.target.value)}
                    placeholder="4"
                    className="h-8 text-xs"
                  />
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
                      onChange={(e) => updateRow(idx, "unitType", e.target.value as BuiltUnitType)}
                      className="h-8 text-xs"
                    >
                      {UNIT_TYPES.map((t) => (
                        <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
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
                      required
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => duplicateRow(idx)}
                      disabled={saving}
                      title="Duplicate row"
                      aria-label="Duplicate row"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeRow(idx)}
                        disabled={saving}
                        title="Remove row"
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Row 2: phase, area + unit, asking price */}
                <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                  {projectPhases.length > 0 && (
                    <div className="col-span-4 space-y-1">
                      <Label className="text-caption">Phase</Label>
                      <Select
                        value={row.phaseId}
                        onChange={(e) => updateRow(idx, "phaseId", e.target.value)}
                        className="h-8 text-xs"
                      >
                        <option value="">No phase</option>
                        {projectPhases.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <div className={projectPhases.length > 0 ? "col-span-4 space-y-1" : "col-span-6 space-y-1"}>
                    <Label className="text-caption">Area *</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={row.area}
                        onChange={(e) => updateRow(idx, "area", e.target.value)}
                        placeholder="850"
                        className="h-8 text-xs"
                        required
                      />
                      <Select
                        value={row.areaUnit}
                        onChange={(e) => updateRow(idx, "areaUnit", e.target.value as AreaUnit)}
                        className="h-8 w-20 shrink-0 text-xs"
                      >
                        {AREA_UNITS.map((u) => (
                          <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className={projectPhases.length > 0 ? "col-span-4 space-y-1" : "col-span-6 space-y-1"}>
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

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || projects.length === 0 || hasDuplicates}>
            {saving ? "Creating…" : `Create ${rows.length} Unit${rows.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
