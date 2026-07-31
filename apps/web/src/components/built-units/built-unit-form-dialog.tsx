"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import type { BuiltUnitType, ProjectOption } from "@/lib/types";

const UNIT_TYPES: BuiltUnitType[] = [
  "BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "OTHER",
];

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK",
  BHK_2: "2 BHK",
  BHK_3: "3 BHK",
  BHK_4: "4 BHK",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE_UNIT: "Warehouse Unit",
  OTHER: "Other",
};

type UnitRow = {
  id: string;
  unitType: BuiltUnitType;
  unitNumber: string;
  floor: string;
  wing: string;
  area: string;
  askingPrice: string;
};

function emptyRow(): UnitRow {
  return {
    id: crypto.randomUUID(),
    unitType: "BHK_2",
    unitNumber: "",
    floor: "",
    wing: "",
    area: "",
    askingPrice: "",
  };
}

export function BuiltUnitFormDialog({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [rows, setRows] = useState<UnitRow[]>([emptyRow()]);

  function addRow() {
    setRows((r) => [...r, emptyRow()]);
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, key: keyof UnitRow, value: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  function reset() {
    setProjectId("");
    setRows([emptyRow()]);
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
        unitType: r.unitType,
        unitNumber: r.unitNumber.trim(),
        floor: r.floor ? Number(r.floor) || null : null,
        wing: r.wing.trim() || null,
        area: Number(r.area) || 0,
        areaUnit: "SQFT" as const,
        askingPrice: r.askingPrice ? Number(r.askingPrice) || null : null,
      }));
      const res = await fetch("/api/built-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create units");
      toast.success(`${payload.length} unit${payload.length !== 1 ? "s" : ""} created`);
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
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
      <form onSubmit={onSubmit} className="space-y-3">
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
        </div>

        {/* Unit rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-body font-medium">Units</p>
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> Add Unit
            </Button>
          </div>

          {rows.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-end rounded-md border p-2">
              <div className="col-span-3 space-y-1">
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
              <div className="col-span-2 space-y-1">
                <Label className="text-caption">Unit No. *</Label>
                <Input
                  value={row.unitNumber}
                  onChange={(e) => updateRow(idx, "unitNumber", e.target.value)}
                  placeholder="A-101"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="col-span-1 space-y-1">
                <Label className="text-caption">Floor</Label>
                <Input
                  type="number"
                  value={row.floor}
                  onChange={(e) => updateRow(idx, "floor", e.target.value)}
                  placeholder="1"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-1 space-y-1">
                <Label className="text-caption">Wing</Label>
                <Input
                  value={row.wing}
                  onChange={(e) => updateRow(idx, "wing", e.target.value)}
                  placeholder="A"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-caption">Area *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={row.area}
                  onChange={(e) => updateRow(idx, "area", e.target.value)}
                  placeholder="850"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-caption">Asking Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={row.askingPrice}
                  onChange={(e) => updateRow(idx, "askingPrice", e.target.value)}
                  placeholder="0"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRow(idx)}
                    disabled={saving}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || projects.length === 0}>
            {saving ? "Creating…" : `Create ${rows.length} Unit${rows.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
