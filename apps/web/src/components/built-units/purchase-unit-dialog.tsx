"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
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
  const [unitType, setUnitType] = useState<BuiltUnitType>("BHK_2");
  const [unitNumber, setUnitNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [wing, setWing] = useState("");
  const [area, setArea] = useState("");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("SQFT");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Local copy of projects so freshly created ones appear without a refresh
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  useEffect(() => {
    if (open) {
      setProjectId(projects[0]?.id ?? "");
      setUnitType("BHK_2");
      setUnitNumber("");
      setFloor("");
      setWing("");
      setArea("");
      setAreaUnit("SQFT");
      setAcquisitionCost("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setAskingPrice("");
      setNotes("");
    }
  }, [open, projects]);

  const handleSubmit = async () => {
    if (!projectId) { toast.error("Select a project"); return; }
    if (!unitNumber.trim()) { toast.error("Unit number is required"); return; }
    const areaNum = parseFloat(area);
    if (!areaNum || areaNum <= 0) { toast.error("Area must be > 0"); return; }
    const costNum = parseFloat(acquisitionCost);
    if (!costNum || costNum <= 0) { toast.error("Acquisition cost must be > 0"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/built-units/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          unitType,
          unitNumber: unitNumber.trim(),
          floor: floor ? parseInt(floor) : null,
          wing: wing.trim() || null,
          area: areaNum,
          areaUnit,
          acquisitionCost: costNum,
          purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
          askingPrice: askingPrice ? parseFloat(askingPrice) : null,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to purchase unit");
        return;
      }
      toast.success(`Unit ${data.unitNumber} purchased for ${formatCurrency(data.acquisitionCost)}`);
      onOpenChange(false);
      onPurchased?.();
    } catch {
      toast.error("Failed to purchase unit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Purchase Unit"
      description="Record buying an existing unit (flat, shop, office). The unit starts as Available with the acquisition cost as its cost basis."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || projects.length === 0}>
            {saving ? "Saving…" : <><ShoppingCart className="h-4 w-4 mr-1" /> Purchase Unit</>}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit Type">
            <Select value={unitType} onChange={(e) => setUnitType(e.target.value as BuiltUnitType)}>
              {UNIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unit Number">
            <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g. A-101" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Floor">
            <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. 1" />
          </Field>
          <Field label="Wing">
            <Input value={wing} onChange={(e) => setWing(e.target.value)} placeholder="e.g. A" />
          </Field>
          <Field label="Purchase Date">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Area">
            <Input type="number" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. 1200" />
          </Field>
          <Field label="Unit">
            <Select value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}>
              {AREA_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Acquisition Cost">
            <Input type="number" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} placeholder="e.g. 5000000" />
          </Field>
          <Field label="Asking Price (optional)">
            <Input type="number" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="e.g. 5500000" />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any notes about this purchase…" />
        </Field>
      </div>
    </Dialog>
  );
}
