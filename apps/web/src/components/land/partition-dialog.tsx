"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Layers, Check, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import type { LandParcelRow } from "@/lib/types";

type ChildForm = { id: string; number: string; area: string; askingPrice: string };

function newChild(): ChildForm {
  return { id: crypto.randomUUID(), number: "", area: "", askingPrice: "" };
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

  // Reset children when a new parcel is opened
  function resetFor(newParcel: LandParcelRow | null) {
    if (newParcel) {
      setChildren([newChild(), newChild()]);
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
  const canSubmit = areaMatches && allHaveNumbers && allHaveAreas && children.length >= 2 && !saving;

  function addChild() {
    setChildren((c) => [...c, newChild()]);
  }

  function removeChild(idx: number) {
    setChildren((c) => c.filter((_, i) => i !== idx));
  }

  function updateChild(idx: number, key: keyof ChildForm, value: string) {
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
          children: children.map((c) => ({
            number: c.number.trim(),
            area: Number(c.area),
            askingPrice: c.askingPrice ? Number(c.askingPrice) : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Partition failed");
      toast.success(`Parcel partitioned into ${children.length} sub-plots`);
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
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
      className="max-w-2xl"
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
              <div key={child.id} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-caption text-muted-foreground">Number</Label>
                  <Input
                    value={child.number}
                    onChange={(e) => updateChild(idx, "number", e.target.value)}
                    placeholder={`PLOT-${idx + 1}A`}
                    required
                  />
                </div>
                <div className="w-28 space-y-1">
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
                <div className="w-32 space-y-1">
                  <Label className="text-caption text-muted-foreground">Asking Price</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={child.askingPrice}
                    onChange={(e) => updateChild(idx, "askingPrice", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                {children.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChild(idx)}
                    title="Remove"
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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
