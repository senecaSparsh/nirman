"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Plus, Minus, AlertTriangle } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

type StockItemRow = {
  locationId: string;
  locationName: string;
  locationType: string;
  qty: number;
  movingAvgCost: number;
};

type LocationOption = {
  id: string;
  name: string;
  type: string;
  projectName: string | null;
};

/**
 * AdjustStockDialog — manually add (IN) or remove (OUT) stock for a material
 * at a location. Used for opening stock, corrections, and write-offs.
 *
 * IN:  user enters qty + optional unit cost (pre-filled with current MAC).
 *      MAC is recalculated from the supplied cost.
 * OUT: user enters qty + reason; valued at the current MAC. Available stock
 *      is shown and enforced server-side.
 */
export function AdjustStockDialog({
  open,
  onOpenChange,
  material,
  stockItems,
  locations: serverLocations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: {
    id: string;
    code: string;
    name: string;
    unit: string;
    currentCost: number;
    isLotTracked: boolean;
  };
  stockItems: StockItemRow[];
  locations?: LocationOption[];
}) {
  const [locations, setLocations] = useState<LocationOption[]>(
    serverLocations ??
      stockItems.map((i) => ({
        id: i.locationId,
        name: i.locationName,
        type: i.locationType,
        projectName: null,
      })),
  );
  const [locLoading, setLocLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [locationId, setLocationId] = useState(stockItems[0]?.locationId ?? "");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const fetchLocations = useCallback(async () => {
    setLocLoading(true);
    try {
      const res = await fetch("/api/stock-locations");
      if (!res.ok) throw new Error("Failed to load locations");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid stock locations response");
      const fetched: LocationOption[] = data.map((l: LocationOption) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        projectName: l.projectName ?? null,
      }));
      // Merge with the locations we already know about from the material stock
      // items so there are never gaps if the API is empty or fails.
      setLocations((prev) => {
        const map = new Map<string, LocationOption>();
        for (const l of prev) map.set(l.id, l);
        for (const l of fetched) map.set(l.id, l);
        return fetched.length > 0 ? fetched : Array.from(map.values());
      });
    } catch {
      // Silent fallback: the stock-item locations remain available.
      toast.error("Could not load all stock locations");
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      const fallback = serverLocations ??
        stockItems.map((i) => ({
          id: i.locationId,
          name: i.locationName,
          type: i.locationType,
          projectName: null,
        }));
      setLocations(fallback);
      // Prefer a location where this material actually has stock, so the
      // current-balance card shows immediately. Fall back to the first option.
      const defaultId = stockItems[0]?.locationId ?? fallback[0]?.id ?? "";
      setLocationId(defaultId);
      setDirection("IN");
      setQty("");
      setUnitCost("");
      setReason("");
      if (!serverLocations) {
        fetchLocations();
      }
    }
  }, [open, fetchLocations, stockItems, serverLocations]);

  // Pre-fill unit cost with the selected location's MAC (or material currentCost).
  const selectedStock = stockItems.find((s) => s.locationId === locationId);
  const defaultCost =
    selectedStock && selectedStock.movingAvgCost > 0
      ? selectedStock.movingAvgCost
      : material.currentCost;
  const effectiveUnitCost = unitCost === "" ? defaultCost : Number(unitCost);
  const availableQty = selectedStock?.qty ?? 0;
  const qtyNum = Number(qty) || 0;
  const lineValue = qtyNum * (direction === "IN" ? effectiveUnitCost : defaultCost);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      toast.error("Select a stock location");
      return;
    }
    if (qtyNum <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (direction === "OUT" && qtyNum > availableQty) {
      toast.error(
        `Cannot remove ${qtyNum} ${material.unit}: only ${formatNumber(availableQty, 3)} ${material.unit} available at this location`,
      );
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for the adjustment");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        locationId,
        direction,
        qty: qtyNum,
        reason: reason.trim(),
      };
      if (direction === "IN") {
        payload.unitCost = effectiveUnitCost;
      }

      const res = await fetch(`/api/materials/${material.id}/adjust-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to adjust stock");
      }
      const data = await res.json();
      const verb = direction === "IN" ? "Added" : "Removed";
      toast.success(
        `${verb} ${formatNumber(qtyNum, 3)} ${material.unit} — new balance ${formatNumber(Number(data.newQty), 3)} ${material.unit}`,
      );
      onOpenChange(false);
      // revalidatePath on the server refreshes the RSC; force a client refresh too.
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust Stock — ${material.code}`}
      description={`${material.name} · ${material.unit}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Direction toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("IN")}
            className={`flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-body font-medium transition-colors ${
              direction === "IN"
                ? "border-success bg-success/10 text-success"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Plus className="h-4 w-4" /> Add Stock
          </button>
          <button
            type="button"
            onClick={() => setDirection("OUT")}
            className={`flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-body font-medium transition-colors ${
              direction === "OUT"
                ? "border-danger bg-danger/10 text-danger"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Minus className="h-4 w-4" /> Remove Stock
          </button>
        </div>

        {material.isLotTracked && direction === "IN" && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-body text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This material is lot-tracked. Opening stock for a new lot should be received via a
              purchase order or direct purchase. Manual IN adjustments can only add to an existing
              lot.
            </span>
          </div>
        )}

        <Field label="Stock Location" required>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={locLoading || locations.length === 0}>
            {locations.length === 0 ? (
              <option value="">No locations available</option>
            ) : (
              locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.projectName ? ` · ${l.projectName}` : ""}
                </option>
              ))
            )}
          </Select>
        </Field>

        {selectedStock && (
          <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-caption text-muted-foreground">
            <div className="flex items-baseline justify-between">
              <span>Current balance</span>
              <span className="tnum font-medium text-foreground">
                {formatNumber(availableQty, 3)} {material.unit}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span>Moving avg cost</span>
              <span className="tnum font-medium text-foreground">
                {formatCurrency(selectedStock.movingAvgCost)}
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Quantity (${material.unit})`} required>
            <Input
              type="number"
              step="any"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              required
              autoFocus
            />
          </Field>
          {direction === "IN" ? (
            <Field label="Unit Cost (optional)" hint={`Defaults to ${formatCurrency(defaultCost)}`}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder={String(defaultCost || "")}
              />
            </Field>
          ) : (
            <Field label="Value at MAC">
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-body text-muted-foreground tnum">
                {formatCurrency(lineValue)}
              </div>
            </Field>
          )}
        </div>

        {direction === "IN" && qtyNum > 0 && (
          <div className="flex items-baseline justify-between rounded-lg border border-border p-2.5">
            <span className="text-caption text-muted-foreground">Line value</span>
            <span className="tnum text-body font-semibold text-foreground">
              {formatCurrency(lineValue)}
            </span>
          </div>
        )}

        <Field label="Reason" required hint="Recorded in the audit trail and stock movement history.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              direction === "IN"
                ? "e.g. Opening stock entry"
                : "e.g. Damaged in storage / write-off"
            }
            required
            maxLength={500}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} variant={direction === "IN" ? "default" : "destructive"}>
            {saving
              ? "Saving…"
              : direction === "IN"
                ? `Add ${qtyNum > 0 ? formatNumber(qtyNum, 3) : ""} ${material.unit}`.trim()
                : `Remove ${qtyNum > 0 ? formatNumber(qtyNum, 3) : ""} ${material.unit}`.trim()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
