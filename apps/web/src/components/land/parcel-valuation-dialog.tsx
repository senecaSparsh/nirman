"use client";

import { useState } from "react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcel: LandParcelRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    currentValuation: "",
    askingPrice: "",
  });

  // Sync form when a new parcel is opened
  const parcelId = parcel?.id;
  const [lastParcelId, setLastParcelId] = useState<string | null>(null);
  if (open && parcelId && parcelId !== lastParcelId) {
    setLastParcelId(parcelId);
    setForm({
      currentValuation: String(parcel!.currentValuation),
      askingPrice: parcel!.askingPrice ? String(parcel!.askingPrice) : "",
    });
  }
  if (!open && lastParcelId !== null) {
    setLastParcelId(null);
  }

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    setSaving(true);
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valuation",
          parcelId: parcel.id,
          currentValuation: form.currentValuation ? Number(form.currentValuation) : undefined,
          askingPrice: form.askingPrice ? Number(form.askingPrice) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Valuation update failed");
      toast.success("Valuation updated");
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
      title="Edit Valuation"
      description={`${parcel.number} · ${formatNumber(parcel.area, 0)} ${parcel.areaUnit} · Acquisition: ${formatCurrency(parcel.acquisitionCost)}`}
      className="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pv-valuation">Current Valuation</Label>
          <Input
            id="pv-valuation"
            type="number"
            min={0}
            step="any"
            value={form.currentValuation}
            onChange={(e) => set("currentValuation", e.target.value)}
            placeholder="0"
          />
          <p className="text-caption text-muted-foreground">
            The current market valuation of this parcel.
          </p>
        </div>
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
          <p className="text-caption text-muted-foreground">
            The price at which you&apos;re willing to sell this parcel.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Valuation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
