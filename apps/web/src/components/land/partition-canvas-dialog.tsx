"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, AlertCircle, Layers, Construction } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { rectangle, type Polygon } from "@nirman/services/geometry";
import { PartitionCanvas, type PlotResult } from "./partition-canvas";
import type { LandParcelRow } from "@/lib/types";

type PlotForm = {
  number: string;
  askingPrice: string;
  isInfrastructure: boolean;
  weightFactor: string;
};

type AllocationModel = "PRO_RATA" | "MARKET_VALUE";

export function PartitionCanvasDialog({
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
  const [plots, setPlots] = useState<PlotResult[]>([]);
  const [forms, setForms] = useState<PlotForm[]>([]);
  const [allocationModel, setAllocationModel] = useState<AllocationModel>("PRO_RATA");
  const [developmentCost, setDevelopmentCost] = useState("");

  // Derive the parent polygon. If the parcel has stored geometry, use it;
  // otherwise default to a rectangle (aspect ratio ~golden for visual appeal).
  const parentPolygon: Polygon = useCallback(() => {
    // Default: a rectangle filling most of the canvas (leave margin for labels)
    return rectangle(0.9, 0.7);
  }, [])();

  const onPlotsChange = useCallback((newPlots: PlotResult[]) => {
    setPlots(newPlots);
    // Sync forms — preserve existing entries, add new ones for new plots
    setForms((prev) => {
      const next = newPlots.map((_, i) =>
        prev[i] ?? {
          number: `PLOT-${i + 1}`,
          askingPrice: "",
          isInfrastructure: false,
          weightFactor: "",
        },
      );
      return next;
    });
  }, []);

  // Area conservation: since we split geometrically, areas always sum to parent.
  // But we show it for user confidence.
  const childAreas = plots.map((p) => p.area * (parcel?.area ?? 0));
  const childAreaSum = childAreas.reduce((s, a) => s + a, 0);
  const parentArea = parcel?.area ?? 0;
  const areaDiff = childAreaSum - parentArea;
  const areaMatches = Math.abs(areaDiff) < 0.001;

  const allHaveNumbers = forms.every((f) => f.number.trim() !== "");
  const hasMinPlots = plots.length >= 2;
  const saleableCount = forms.filter((f) => !f.isInfrastructure).length;
  const canSubmit = hasMinPlots && allHaveNumbers && !saving && areaMatches && saleableCount >= 1;

  // Cost allocation preview (mirrors server logic)
  const devCost = developmentCost ? Number(developmentCost) || 0 : 0;
  const totalBasis = (parcel?.acquisitionCost ?? 0) + devCost;
  const previewCosts = plots.map((plot, i) => {
    const area = plot.area * parentArea;
    const isInfra = forms[i]?.isInfrastructure ?? false;
    if (isInfra) return 0;
    const saleableAreas = plots.map((p, j) => ({
      area: p.area * parentArea,
      isInfra: forms[j]?.isInfrastructure ?? false,
      weight: forms[j]?.weightFactor ? Number(forms[j]!.weightFactor) || 1 : 1,
    })).filter((x) => !x.isInfra);
    if (saleableAreas.length === 0) return 0;
    if (allocationModel === "MARKET_VALUE") {
      const sumW = saleableAreas.reduce((s, x) => s + x.area * x.weight, 0);
      return sumW > 0 ? (totalBasis * area * (forms[i]?.weightFactor ? Number(forms[i]!.weightFactor) || 1 : 1)) / sumW : 0;
    }
    const sumSaleable = saleableAreas.reduce((s, x) => s + x.area, 0);
    return sumSaleable > 0 ? (totalBasis * area) / sumSaleable : 0;
  });

  function updateForm(idx: number, key: keyof PlotForm, value: string | boolean) {
    setForms((f) => f.map((form, i) => (i === idx ? { ...form, [key]: value } : form)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    if (plots.length < 2) return toast.error("Draw at least one cut to create 2+ plots");
    if (!allHaveNumbers) return toast.error("Every plot needs a number");

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
          children: plots.map((plot, i) => ({
            number: forms[i]!.number.trim(),
            area: Number((plot.area * parentArea).toFixed(3)),
            askingPrice: forms[i]!.askingPrice ? Number(forms[i]!.askingPrice) : undefined,
            isInfrastructure: forms[i]!.isInfrastructure,
            weightFactor: forms[i]!.weightFactor ? Number(forms[i]!.weightFactor) : undefined,
            geometry: plot.polygon,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Partition failed");
      toast.success(`Parcel partitioned into ${plots.length} sub-plots`);
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
      title="Partition Canvas"
      description={`Draw cut lines on "${parcel.number}" (${formatNumber(parcel.area, 3)} ${parcel.areaUnit}) to carve sellable sub-plots. Areas are computed from the geometry.`}
      className="max-w-4xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Parent info */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-body">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{parcel.number}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tnum">{formatNumber(parcel.area, 3)} {parcel.areaUnit}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tnum">{formatCurrency(parcel.acquisitionCost)} acquisition</span>
          </div>
        </div>

        {/* Canvas */}
        <PartitionCanvas
          parentPolygon={parentPolygon}
          parentArea={parentArea}
          areaUnit={parcel.areaUnit}
          onPlotsChange={onPlotsChange}
        />

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
          </div>
        </div>

        {/* Plot assignment form */}
        {plots.length > 1 && (
          <div className="space-y-2">
            <Label>Plot Details ({plots.length})</Label>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {plots.map((plot, idx) => {
                const actualArea = plot.area * parentArea;
                const isInfra = forms[idx]?.isInfrastructure ?? false;
                const allocatedCost = previewCosts[idx] ?? 0;
                return (
                  <div
                    key={idx}
                    className="rounded-md border p-2"
                    style={{ borderLeftColor: plot.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-caption text-muted-foreground">Plot {idx + 1} Number</Label>
                        <Input
                          value={forms[idx]?.number ?? ""}
                          onChange={(e) => updateForm(idx, "number", e.target.value)}
                          placeholder={`PLOT-${idx + 1}`}
                          required
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-caption text-muted-foreground">Area ({parcel.areaUnit})</Label>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-right text-body tnum">
                          {formatNumber(actualArea, 3)}
                        </div>
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-caption text-muted-foreground">Asking Price</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={forms[idx]?.askingPrice ?? ""}
                          onChange={(e) => updateForm(idx, "askingPrice", e.target.value)}
                          placeholder="Optional"
                          disabled={isInfra}
                        />
                      </div>
                      {allocationModel === "MARKET_VALUE" && !isInfra && (
                        <div className="w-20 space-y-1">
                          <Label className="text-caption text-muted-foreground">Weight</Label>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={forms[idx]?.weightFactor ?? ""}
                            onChange={(e) => updateForm(idx, "weightFactor", e.target.value)}
                            placeholder="1"
                          />
                        </div>
                      )}
                      <div className="w-28 space-y-1">
                        <Label className="text-caption text-muted-foreground">Cost Alloc.</Label>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-right text-body tnum text-muted-foreground">
                          {isInfra ? "₹0 (infra)" : formatCurrency(allocatedCost)}
                        </div>
                      </div>
                    </div>
                    <label className="mt-1.5 flex items-center gap-1.5 pl-1 text-caption text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isInfra}
                        onChange={(e) => updateForm(idx, "isInfrastructure", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input"
                      />
                      <Construction className="h-3.5 w-3.5" />
                      Infrastructure (no cost basis)
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              {areaMatches ? "Areas conserved" : "Area mismatch"}
            </span>
            <span className="ml-2 text-caption opacity-80 tnum">
              Plots: {formatNumber(childAreaSum, 3)} {parcel.areaUnit}
              {" · "}Parent: {formatNumber(parentArea, 3)} {parcel.areaUnit}
              {areaDiff !== 0 && (
                <>{" · "}Diff: {areaDiff > 0 ? "+" : ""}{formatNumber(areaDiff, 3)}</>
              )}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Partitioning…" : `Partition into ${plots.length} sub-plots`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
