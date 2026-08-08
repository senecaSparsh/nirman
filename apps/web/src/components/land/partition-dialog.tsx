"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Layers, Check, AlertCircle, Construction } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import type { LandParcelRow } from "@/lib/types";

type AllocationModel = "PRO_RATA" | "MARKET_VALUE";

type ChildForm = {
  id: string;
  number: string;
  area: string;
  askingPrice: string;
  isInfrastructure: boolean;
  marketValue: string;
  weightFactor: string;
};

function newChild(): ChildForm {
  return {
    id: crypto.randomUUID(),
    number: "",
    area: "",
    askingPrice: "",
    isInfrastructure: false,
    marketValue: "",
    weightFactor: "",
  };
}

/**
 * Pure client-side cost allocation preview — mirrors the server
 * `allocatePartitionCosts` logic so the user sees the exact split
 * before submitting.
 */
function computePreview(
  parentCost: number,
  devCost: number,
  children: ChildForm[],
  model: AllocationModel,
): { costs: number[]; totalBasis: number } {
  const totalBasis = parentCost + devCost;
  const areas = children.map((c) => Number(c.area) || 0);
  const isInfra = children.map((c) => c.isInfrastructure);
  const saleableIdx = children.map((_, i) => i).filter((i) => !isInfra[i]);

  const costs = new Array(children.length).fill(0);
  if (saleableIdx.length === 0) return { costs, totalBasis };

  if (model === "MARKET_VALUE") {
    const weighted = saleableIdx.map((i) => {
      const w = children[i]!.weightFactor ? Number(children[i]!.weightFactor) || 1 : 1;
      return areas[i]! * w;
    });
    const sumW = weighted.reduce((s, v) => s + v, 0);
    if (sumW <= 0) return { costs, totalBasis };
    saleableIdx.forEach((idx, k) => {
      costs[idx] = (totalBasis * weighted[k]!) / sumW;
    });
  } else {
    const sumSaleable = saleableIdx.reduce((s, i) => s + areas[i]!, 0);
    if (sumSaleable <= 0) return { costs, totalBasis };
    for (const i of saleableIdx) {
      costs[i] = (totalBasis * areas[i]!) / sumSaleable;
    }
  }
  return { costs, totalBasis };
}

export function PartitionDialog({
  open,
  onOpenChange,
  parcel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcel: LandParcelRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [children, setChildren] = useState<ChildForm[]>([newChild(), newChild()]);
  const [allocationModel, setAllocationModel] = useState<AllocationModel>("PRO_RATA");
  const [developmentCost, setDevelopmentCost] = useState("");

  // Reset children when a new parcel is opened
  function resetFor(newParcel: LandParcelRow | null) {
    if (newParcel) {
      setChildren([newChild(), newChild()]);
      setAllocationModel("PRO_RATA");
      setDevelopmentCost("");
    }
  }

  // Ensure children are reset whenever the dialog opens with a new parcel
  const parcelId = parcel?.id;
  const [lastParcelId, setLastParcelId] = useState<string | null>(null);
  if (open && parcelId && parcelId !== lastParcelId) {
    setLastParcelId(parcelId);
    resetFor(parcel);
  }
  if (!open && lastParcelId !== null) {
    setLastParcelId(null);
  }

  const childAreaSum = children.reduce((s, c) => s + (Number(c.area) || 0), 0);
  const parentArea = parcel?.area ?? 0;
  const areaDiff = childAreaSum - parentArea;
  const areaMatches = parcel != null && Math.abs(areaDiff) < 0.001;
  const allHaveNumbers = children.every((c) => c.number.trim() !== "");
  const allHaveAreas = children.every((c) => Number(c.area) > 0);
  const saleableCount = children.filter((c) => !c.isInfrastructure).length;
  const canSubmit =
    areaMatches &&
    allHaveNumbers &&
    allHaveAreas &&
    children.length >= 2 &&
    saleableCount >= 1 &&
    !saving;

  // Live cost allocation preview
  const parentCost = parcel?.acquisitionCost ?? 0;
  const devCost = developmentCost ? Number(developmentCost) || 0 : 0;
  const { costs: previewCosts, totalBasis } = computePreview(
    parentCost,
    devCost,
    children,
    allocationModel,
  );

  function addChild() {
    setChildren((c) => [...c, newChild()]);
  }

  function removeChild(idx: number) {
    setChildren((c) => c.filter((_, i) => i !== idx));
  }

  function updateChild(idx: number, key: keyof ChildForm, value: string | boolean) {
    setChildren((c) => c.map((ch, i) => (i === idx ? { ...ch, [key]: value } : ch)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    if (children.length < 2) {
      toast.error("At least 2 children are required");
      return;
    }
    if (!allHaveNumbers) {
      toast.error("Every child parcel needs a number");
      return;
    }
    if (!allHaveAreas) {
      toast.error("Every child parcel needs a positive area");
      return;
    }
    if (saleableCount < 1) {
      toast.error("At least one saleable (non-infrastructure) child is required");
      return;
    }
    if (!areaMatches) {
      toast.error(
        `Area mismatch: children sum to ${formatNumber(childAreaSum, 3)} but parent is ${formatNumber(parentArea, 3)} ${parcel.areaUnit}`,
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "partition",
          parentParcelId: parcel.id,
          allocationModel,
          developmentCost: developmentCost ? Number(developmentCost) : undefined,
          children: children.map((c) => ({
            number: c.number.trim(),
            area: Number(c.area),
            askingPrice: c.askingPrice ? Number(c.askingPrice) : undefined,
            isInfrastructure: c.isInfrastructure,
            marketValue: c.marketValue ? Number(c.marketValue) : undefined,
            weightFactor: c.weightFactor ? Number(c.weightFactor) : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Partition failed");
      toast.success(`Parcel partitioned into ${children.length} sub-plots`, {
        action: {
          label: "View Parcels",
          onClick: () => router.push("/land"),
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

  if (!open || !parcel) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Partition Parcel"
      description={`Split "${parcel.number}" (${formatNumber(parcel.area, 3)} ${parcel.areaUnit}) into sellable sub-plots. The sum of child areas must equal the parent area.`}
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Parent info summary */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-body">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{parcel.number}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tnum">{formatNumber(parcel.area, 3)} {parcel.areaUnit}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tnum">{formatNumber(parcel.acquisitionCost)} acquisition</span>
          </div>
        </div>

        {/* Allocation model + development cost */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-caption text-muted-foreground">Allocation Model</Label>
            <Select
              value={allocationModel}
              onChange={(e) => setAllocationModel(e.target.value as AllocationModel)}
            >
              <option value="PRO_RATA">Pro-Rata Area</option>
              <option value="MARKET_VALUE">Market Value Weighted</option>
            </Select>
            <p className="text-caption text-muted-foreground">
              {allocationModel === "PRO_RATA"
                ? "Cost split by area across saleable plots."
                : "Cost split by area × weight factor."}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-caption text-muted-foreground">Development Cost (optional)</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={developmentCost}
              onChange={(e) => setDevelopmentCost(e.target.value)}
              placeholder="0"
            />
            <p className="text-caption text-muted-foreground">
              Grading, paving, utilities — added to cost basis.
            </p>
          </div>
        </div>

        {/* Children list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Child Parcels ({children.length})</Label>
            <Button type="button" variant="outline" size="sm" onClick={addChild}>
              <Plus className="h-3.5 w-3.5" /> Add Child
            </Button>
          </div>

          <div className="space-y-2">
            {children.map((child, idx) => (
              <div key={child.id} className="space-y-1.5">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-caption text-muted-foreground">Number</Label>
                    <Input
                      value={child.number}
                      onChange={(e) => updateChild(idx, "number", e.target.value)}
                      placeholder={`PLOT-${idx + 1}A`}
                      required
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-caption text-muted-foreground">Area ({parcel.areaUnit})</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={child.area}
                      onChange={(e) => updateChild(idx, "area", e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-caption text-muted-foreground">Asking Price</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={child.askingPrice}
                      onChange={(e) => updateChild(idx, "askingPrice", e.target.value)}
                      placeholder="Optional"
                      disabled={child.isInfrastructure}
                    />
                  </div>
                  {allocationModel === "MARKET_VALUE" && !child.isInfrastructure && (
                    <div className="w-20 space-y-1">
                      <Label className="text-caption text-muted-foreground">Weight</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={child.weightFactor}
                        onChange={(e) => updateChild(idx, "weightFactor", e.target.value)}
                        placeholder="1"
                      />
                    </div>
                  )}
                  {children.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChild(idx)}
                      title="Remove"
                      aria-label="Remove parcel"
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* Infrastructure toggle + market value */}
                <div className="flex items-center gap-4 pl-1">
                  <label className="flex items-center gap-1.5 text-caption text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={child.isInfrastructure}
                      onChange={(e) => updateChild(idx, "isInfrastructure", e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input"
                    />
                    <Construction className="h-3.5 w-3.5" />
                    Infrastructure (no cost basis)
                  </label>
                  {!child.isInfrastructure && (
                    <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <span>Market Value:</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={child.marketValue}
                        onChange={(e) => updateChild(idx, "marketValue", e.target.value)}
                        placeholder="Optional"
                        className="h-7 w-28 rounded-md border border-input bg-card px-2 text-caption focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                      />
                    </div>
                  )}
                  {/* Allocated cost preview */}
                  <span className="ml-auto tnum text-caption font-medium">
                    {child.isInfrastructure
                      ? "₹0 (infra)"
                      : `₹${formatNumber(previewCosts[idx] ?? 0)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Area conservation indicator */}
        <div
          className={`flex items-center gap-2 rounded-md border p-3 text-body transition-colors ${
            areaMatches
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {areaMatches ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <div className="flex-1">
            <span className="font-medium">
              {areaMatches ? "Areas match" : "Area mismatch"}
            </span>
            <span className="ml-2 text-caption opacity-80 tnum">
              Children: {formatNumber(childAreaSum, 3)} {parcel.areaUnit}
              {" · "}Parent: {formatNumber(parentArea, 3)} {parcel.areaUnit}
              {areaDiff !== 0 && (
                <>{" · "}Diff: {areaDiff > 0 ? "+" : ""}{formatNumber(areaDiff, 3)}</>
              )}
            </span>
          </div>
        </div>

        {/* Cost allocation summary */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-body">
            <span className="font-medium">Cost Allocation Preview</span>
            <span className="text-caption text-muted-foreground tnum">
              Total basis: ₹{formatNumber(totalBasis)}
              {devCost > 0 && (
                <span className="ml-1 opacity-70">
                  (acq ₹{formatNumber(parentCost)} + dev ₹{formatNumber(devCost)})
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {children.map((child, idx) => (
              <div key={child.id} className="flex items-center justify-between text-caption tnum">
                <span className={child.isInfrastructure ? "text-muted-foreground" : ""}>
                  {child.number || `Child ${idx + 1}`}
                  {child.isInfrastructure && " (infra)"}
                </span>
                <span className={child.isInfrastructure ? "text-muted-foreground" : "font-medium"}>
                  ₹{formatNumber(previewCosts[idx] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Partitioning…" : `Partition into ${children.length} sub-plots`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
