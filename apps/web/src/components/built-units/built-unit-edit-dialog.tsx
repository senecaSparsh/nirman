"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Home } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { StatusPill, statusColor } from "@/components/page";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { AreaUnit, BuiltUnitRow, BuiltUnitType } from "@/lib/types";

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

export function BuiltUnitEditDialog({
  open,
  onOpenChange,
  unit,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: BuiltUnitRow | null;
  /** Called after a successful edit with the new field values, for optimistic UI. */
  onUpdated?: (unitId: string, updates: {
    unitType: BuiltUnitType;
    unitNumber: string;
    floor: number | null;
    wing: string | null;
    area: number;
    areaUnit: AreaUnit;
    askingPrice: number | null;
    // RERA fields
    carpetArea: number | null;
    superBuiltUpArea: number | null;
    balconyArea: number | null;
    clearHeight: number | null;
    hasLoadingDock: boolean;
  }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [unitType, setUnitType] = useState<BuiltUnitType>("BHK_2");
  const [unitNumber, setUnitNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [wing, setWing] = useState("");
  const [area, setArea] = useState("");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("SQFT");
  const [askingPrice, setAskingPrice] = useState("");
  // RERA fields
  const [carpetArea, setCarpetArea] = useState("");
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState("");
  const [balconyArea, setBalconyArea] = useState("");
  const [clearHeight, setClearHeight] = useState("");
  const [hasLoadingDock, setHasLoadingDock] = useState(false);

  // Pre-populate from the unit whenever the dialog opens
  useEffect(() => {
    if (open && unit) {
      setUnitType(unit.unitType);
      setUnitNumber(unit.unitNumber);
      setFloor(unit.floor != null ? String(unit.floor) : "");
      setWing(unit.wing ?? "");
      setArea(unit.area ? String(unit.area) : "");
      setAreaUnit(unit.areaUnit);
      setAskingPrice(unit.askingPrice != null ? String(unit.askingPrice) : "");
      // RERA fields
      setCarpetArea(unit.carpetArea != null ? String(unit.carpetArea) : "");
      setSuperBuiltUpArea(unit.superBuiltUpArea != null ? String(unit.superBuiltUpArea) : "");
      setBalconyArea(unit.balconyArea != null ? String(unit.balconyArea) : "");
      setClearHeight(unit.clearHeight != null ? String(unit.clearHeight) : "");
      setHasLoadingDock(unit.hasLoadingDock);
    }
  }, [open, unit]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) return;
    if (!unitNumber.trim()) {
      toast.error("Unit number is required");
      return;
    }
    if (!area || Number(area) <= 0) {
      toast.error("Area must be > 0");
      return;
    }

    setSaving(true);
    try {
      const body = {
        action: "edit" as const,
        unitType,
        unitNumber: unitNumber.trim(),
        floor: floor ? Number(floor) || null : null,
        wing: wing.trim() || null,
        area: Number(area) || 0,
        areaUnit,
        askingPrice: askingPrice ? Number(askingPrice) || null : null,
        // RERA fields
        carpetArea: carpetArea ? Number(carpetArea) || null : null,
        superBuiltUpArea: superBuiltUpArea ? Number(superBuiltUpArea) || null : null,
        balconyArea: balconyArea ? Number(balconyArea) || null : null,
        clearHeight: clearHeight ? Number(clearHeight) || null : null,
        hasLoadingDock,
      };
      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update unit");
      toast.success(`Unit ${unitNumber.trim()} updated`);
      onUpdated?.(unit.id, {
        unitType,
        unitNumber: unitNumber.trim(),
        floor: body.floor,
        wing: body.wing,
        area: body.area,
        areaUnit,
        askingPrice: body.askingPrice,
        // RERA fields
        carpetArea: body.carpetArea,
        superBuiltUpArea: body.superBuiltUpArea,
        balconyArea: body.balconyArea,
        clearHeight: body.clearHeight,
        hasLoadingDock: body.hasLoadingDock,
      });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  if (!unit) return null;

  // Live preview of price-per-sqft — uses superBuiltUpArea (RERA saleable area)
  // falling back to area if superBuiltUpArea is not set.
  const previewAsking = askingPrice ? Number(askingPrice) : null;
  const previewSuperBuiltUp = superBuiltUpArea ? Number(superBuiltUpArea) : (area ? Number(area) : unit.area);
  const previewPricePerSqft = previewAsking != null && previewSuperBuiltUp > 0
    ? previewAsking / previewSuperBuiltUp
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${unit.unitNumber}`}
      description="Update the unit's attributes. Only available while the unit is Planned or under Construction."
      className="max-w-lg"
    >
      {/* ── Unit identity header (read-only context) ── */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklch, ${statusColor(unit.status)} 12%, transparent)` }}
        >
          <Home className="h-5 w-5" style={{ color: statusColor(unit.status) }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-bold text-foreground">{unit.projectName}</span>
            <StatusPill status={unit.status} />
          </div>
          {unit.phaseName && (
            <div className="mt-0.5 text-caption text-muted-foreground">{unit.phaseName}</div>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        {/* Unit type + number */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-type">Unit type *</Label>
            <Select
              id="bu-edit-type"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as BuiltUnitType)}
              required
            >
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-number">Unit number *</Label>
            <Input
              id="bu-edit-number"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              required
              placeholder="e.g. A-101"
            />
          </div>
        </div>

        {/* Floor + wing */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-floor">Floor</Label>
            <Input
              id="bu-edit-floor"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-wing">Wing</Label>
            <Input
              id="bu-edit-wing"
              value={wing}
              onChange={(e) => setWing(e.target.value)}
              placeholder="e.g. A"
            />
          </div>
        </div>

        {/* Area + area unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-area">Area *</Label>
            <Input
              id="bu-edit-area"
              type="number"
              step="any"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              required
              placeholder="e.g. 1200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bu-edit-area-unit">Area unit</Label>
            <Select
              id="bu-edit-area-unit"
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
            >
              {AREA_UNITS.map((u) => (
                <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Asking price */}
        <div className="space-y-1.5">
          <Label htmlFor="bu-edit-asking">Asking price</Label>
          <Input
            id="bu-edit-asking"
            type="number"
            step="any"
            value={askingPrice}
            onChange={(e) => setAskingPrice(e.target.value)}
            placeholder="Leave blank if not set"
          />
          {previewPricePerSqft != null && (
            <p className="text-caption text-muted-foreground">
              ≈ {formatNumber(previewPricePerSqft, 0)} ₹/{areaUnit.toLowerCase()} ·{" "}
              {formatCurrency(Number(askingPrice) || 0)}
            </p>
          )}
        </div>

        {/* ── RERA Fields ── */}
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
            <span>RERA Details</span>
            <span className="text-faint">(optional — required for sale documents & portal listings)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bu-edit-carpet">Carpet Area</Label>
              <Input
                id="bu-edit-carpet"
                type="number"
                step="any"
                value={carpetArea}
                onChange={(e) => setCarpetArea(e.target.value)}
                placeholder="RERA carpet area"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bu-edit-super">Super Built-Up Area</Label>
              <Input
                id="bu-edit-super"
                type="number"
                step="any"
                value={superBuiltUpArea}
                onChange={(e) => setSuperBuiltUpArea(e.target.value)}
                placeholder="Saleable area"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bu-edit-balcony">Balcony Area</Label>
              <Input
                id="bu-edit-balcony"
                type="number"
                step="any"
                value={balconyArea}
                onChange={(e) => setBalconyArea(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bu-edit-height">Clear Height</Label>
              <Input
                id="bu-edit-height"
                type="number"
                step="any"
                value={clearHeight}
                onChange={(e) => setClearHeight(e.target.value)}
                placeholder="Floor-to-ceiling (industrial)"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasLoadingDock}
              onChange={(e) => setHasLoadingDock(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span>Has Loading Dock</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
