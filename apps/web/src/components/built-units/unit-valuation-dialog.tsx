"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { BuiltUnitRow } from "@/lib/types";

export function UnitValuationDialog({
  open,
  onOpenChange,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: BuiltUnitRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [currentValuation, setCurrentValuation] = useState("");

  useEffect(() => {
    if (open && unit) {
      setAskingPrice(unit.askingPrice ? String(unit.askingPrice) : "");
      setCurrentValuation(String(unit.currentValuation));
    }
  }, [open, unit]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { action: "valuation" };
      if (askingPrice) body.askingPrice = Number(askingPrice);
      else body.askingPrice = null;
      if (currentValuation) body.currentValuation = Number(currentValuation);

      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update valuation");
      toast.success("Valuation updated");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!unit) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Valuation — ${unit.unitNumber}`}
      description={`${unit.projectName} · ${unit.unitType.replace("_", " ")}`}
      className="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="rounded-lg bg-muted/50 p-3 text-body">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Production Cost</span>
            <span className="tnum font-medium">{formatCurrency(unit.productionCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current Valuation</span>
            <span className="tnum font-medium">{formatCurrency(unit.currentValuation)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Asking Price</span>
            <span className="tnum font-medium">{unit.askingPrice ? formatCurrency(unit.askingPrice) : "—"}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="uv-asking">Asking Price</Label>
          <Input
            id="uv-asking"
            type="number"
            step="0.01"
            min="0"
            value={askingPrice}
            onChange={(e) => setAskingPrice(e.target.value)}
            placeholder="Leave empty to clear"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uv-valuation">Current Valuation</Label>
          <Input
            id="uv-valuation"
            type="number"
            step="0.01"
            min="0"
            value={currentValuation}
            onChange={(e) => setCurrentValuation(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Update Valuation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
