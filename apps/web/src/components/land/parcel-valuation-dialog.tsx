"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { LandParcelRow } from "@/lib/types";

export function ParcelValuationDialog({
  open,
  onOpenChange,
  parcel,
  siblings,
  parentArea,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcel: LandParcelRow | null;
  /** All parcels under the same parent (including this one), for area validation. */
  siblings?: LandParcelRow[];
  /** The parent parcel's total area, for area sum validation. Null if this is a root parcel. */
  parentArea?: number | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    number: "",
    area: "",
    acquisitionCost: "",
    currentValuation: "",
    askingPrice: "",
    isInfrastructure: false,
  });

  // Sync form when a new parcel is opened
  const parcelId = parcel?.id;
  const [lastParcelId, setLastParcelId] = useState<string | null>(null);
  if (open && parcelId && parcelId !== lastParcelId) {
    setLastParcelId(parcelId);
    setForm({
      number: parcel!.number,
      area: String(parcel!.area),
      acquisitionCost: String(parcel!.acquisitionCost),
      currentValuation: String(parcel!.currentValuation),
      askingPrice: parcel!.askingPrice ? String(parcel!.askingPrice) : "",
      isInfrastructure: parcel!.isInfrastructure,
    });
  }
  if (!open && lastParcelId !== null) {
    setLastParcelId(null);
  }

  function set(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ── Live area validation ──
  // If this parcel has a parent, the sum of all sibling areas must equal the
  // parent's area. Show the user the running total and the gap as they type.
  const isChild = parcel?.parentParcelId != null;
  const areaNum = parseFloat(form.area) || 0;
  const areaValidation = useMemo(() => {
    if (!isChild || !siblings || parentArea == null) return null;
    const otherSiblingsSum = siblings
      .filter((s) => s.id !== parcel?.id)
      .reduce((sum, s) => sum + s.area, 0);
    const newTotal = otherSiblingsSum + areaNum;
    const diff = newTotal - parentArea;
    return { otherSiblingsSum, newTotal, diff, parentArea };
  }, [isChild, siblings, parentArea, parcel?.id, areaNum]);

  const areaMismatch = areaValidation != null && Math.abs(areaValidation.diff) > 0.001;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    if (areaMismatch) {
      toast.error(
        `Sibling areas (${formatNumber(areaValidation!.newTotal, 3)}) must sum to the parent's area (${formatNumber(areaValidation!.parentArea, 3)}). ` +
        `Difference: ${areaValidation!.diff > 0 ? "+" : ""}${formatNumber(areaValidation!.diff, 3)}.`,
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          parcelId: parcel.id,
          number: form.number || undefined,
          area: form.area ? Number(form.area) : undefined,
          acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
          currentValuation: form.currentValuation ? Number(form.currentValuation) : undefined,
          askingPrice: form.askingPrice ? Number(form.askingPrice) : null,
          isInfrastructure: form.isInfrastructure,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      toast.success("Parcel updated");
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
      title={`Edit ${parcel.number}`}
      description={`${formatNumber(parcel.area, 0)} ${parcel.areaUnit} · ${parcel.status}`}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* ── Identity ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pv-number">Parcel Number</Label>
            <Input
              id="pv-number"
              value={form.number}
              onChange={(e) => set("number", e.target.value)}
              placeholder="PLOT-1A"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pv-area">Area ({parcel.areaUnit})</Label>
            <Input
              id="pv-area"
              type="number"
              min={0}
              step="any"
              value={form.area}
              onChange={(e) => set("area", e.target.value)}
              className={areaMismatch ? "border-danger" : ""}
            />
          </div>
        </div>

        {/* ── Area validation banner ── */}
        {areaValidation && (
          <div
            className={`rounded-md border p-2.5 text-caption ${
              areaMismatch
                ? "border-danger/30 bg-danger-soft/20 text-danger"
                : "border-success/30 bg-success-soft/20 text-success"
            }`}
          >
            {areaMismatch ? (
              <span>
                ⚠ Sibling areas sum to <strong>{formatNumber(areaValidation.newTotal, 3)} {parcel.areaUnit}</strong> —
                that&apos;s {areaValidation.diff > 0 ? "over" : "under"} the parent by{" "}
                <strong>{formatNumber(Math.abs(areaValidation.diff), 3)} {parcel.areaUnit}</strong>.
                Parent total: {formatNumber(areaValidation.parentArea, 3)} {parcel.areaUnit}.
                Adjust this parcel&apos;s area so the sum matches.
              </span>
            ) : (
              <span>✓ Sibling areas sum to {formatNumber(areaValidation.newTotal, 3)} {parcel.areaUnit} — matches parent.</span>
            )}
          </div>
        )}

        {/* ── Financials ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pv-cost">Acquisition Cost</Label>
            <Input
              id="pv-cost"
              type="number"
              min={0}
              step="any"
              value={form.acquisitionCost}
              onChange={(e) => set("acquisitionCost", e.target.value)}
            />
            <p className="text-caption text-muted-foreground">What this parcel cost to acquire.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pv-valuation">Current Valuation</Label>
            <Input
              id="pv-valuation"
              type="number"
              min={0}
              step="any"
              value={form.currentValuation}
              onChange={(e) => set("currentValuation", e.target.value)}
            />
            <p className="text-caption text-muted-foreground">Today&apos;s market value.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pv-asking">Asking Price</Label>
            <Input
              id="pv-asking"
              type="number"
              min={0}
              step="any"
              value={form.askingPrice}
              onChange={(e) => set("askingPrice", e.target.value)}
              placeholder="Optional"
            />
            <p className="text-caption text-muted-foreground">Price you&apos;ll sell for.</p>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-body text-foreground">
              <input
                type="checkbox"
                checked={form.isInfrastructure}
                onChange={(e) => set("isInfrastructure", e.target.checked)}
                className="size-4 rounded border-input accent-brand"
              />
              Infrastructure plot
            </label>
          </div>
        </div>

        {form.isInfrastructure && (
          <p className="rounded-md bg-muted/40 p-2 text-caption text-muted-foreground">
            Infrastructure plots (roads, parks, utility corridors) have area but no cost basis —
            their cost is absorbed by saleable siblings during partition.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || areaMismatch}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
