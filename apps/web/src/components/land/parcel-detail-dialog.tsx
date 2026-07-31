"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Layers, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { LandPurchaseRow, LandParcelRow } from "@/lib/types";

const PARCEL_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  AVAILABLE: "success",
  HOLD: "warning",
  PARTITIONED: "muted",
  SOLD: "danger",
};

export function ParcelDetailDialog({
  open,
  onOpenChange,
  purchase,
  parcels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: LandPurchaseRow | null;
  parcels: LandParcelRow[];
}) {
  const router = useRouter();
  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);
  const [acting, setActing] = useState(false);

  // Partition form state
  const [children, setChildren] = useState<{ id: string; number: string; area: string; askingPrice: string }[]>([]);
  const [partitionError, setPartitionError] = useState("");

  // Valuation form state
  const [valuation, setValuation] = useState({ currentValuation: "", askingPrice: "" });

  function openPartition(p: LandParcelRow) {
    setPartitionParcel(p);
    setChildren([
      { id: crypto.randomUUID(), number: "", area: "", askingPrice: "" },
      { id: crypto.randomUUID(), number: "", area: "", askingPrice: "" },
    ]);
    setPartitionError("");
  }

  function addChild() {
    setChildren((c) => [...c, { id: crypto.randomUUID(), number: "", area: "", askingPrice: "" }]);
  }
  function removeChild(idx: number) {
    setChildren((c) => c.filter((_, i) => i !== idx));
  }
  function updateChild(idx: number, key: "number" | "area" | "askingPrice", value: string) {
    setChildren((c) => c.map((ch, i) => (i === idx ? { ...ch, [key]: value } : ch)));
  }

  const childAreaSum = children.reduce((s, c) => s + (Number(c.area) || 0), 0);
  const areaDiff = partitionParcel ? childAreaSum - partitionParcel.area : 0;

  async function submitPartition() {
    if (!partitionParcel) return;
    if (children.length < 2) return toast.error("At least 2 children required");
    if (Math.abs(areaDiff) > 0.001) {
      setPartitionError(`Area mismatch: children sum to ${childAreaSum} but parent is ${partitionParcel.area} (diff: ${areaDiff.toFixed(3)})`);
      return;
    }
    setActing(true);
    try {
      const res = await fetch("/api/land-parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "partition",
          parentParcelId: partitionParcel.id,
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
      setPartitionParcel(null);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  function openValuate(p: LandParcelRow) {
    setValuateParcel(p);
    setValuation({
      currentValuation: String(p.currentValuation),
      askingPrice: p.askingPrice ? String(p.askingPrice) : "",
    });
  }

  async function submitValuation() {
    if (!valuateParcel) return;
    setActing(true);
    try {
      const res = await fetch(`/api/land-parcels/${valuateParcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valuate",
          currentValuation: valuation.currentValuation ? Number(valuation.currentValuation) : undefined,
          askingPrice: valuation.askingPrice ? Number(valuation.askingPrice) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Valuation update failed");
      toast.success("Valuation updated");
      setValuateParcel(null);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  async function toggleStatus(p: LandParcelRow) {
    setActing(true);
    try {
      const action = p.status === "AVAILABLE" ? "hold" : "release";
      const res = await fetch(`/api/land-parcels/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(action === "hold" ? "Parcel put on hold" : "Parcel released");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  if (!open || !purchase) return null;

  return (
    <>
      <Dialog
        open={open && !partitionParcel && !valuateParcel}
        onOpenChange={onOpenChange}
        title={purchase.sellerName}
        description={`${formatNumber(purchase.totalArea, 0)} ${purchase.areaUnit} · ${formatCurrency(purchase.totalCost)} · ${purchase.projectName ?? "Standalone"}`}
        className="max-w-3xl"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-meta text-muted-foreground">
            <span>{parcels.length} parcel{parcels.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>Registry: {purchase.registryNo ?? "—"}</span>
            <span>·</span>
            <span>Location: {purchase.location ?? "—"}</span>
          </div>

          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Parcel</TH>
                <TH className="text-right">Area</TH>
                <TH>Status</TH>
                <TH className="text-right">Acquisition</TH>
                <TH className="text-right">Asking</TH>
                <TH className="text-right">Valuation</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {parcels.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-caption font-medium">{p.number}</TD>
                  <TD className="tnum text-right">{formatNumber(p.area, 0)} {p.areaUnit}</TD>
                  <TD><Badge variant={PARCEL_STATUS_VARIANT[p.status]}>{p.status}</Badge></TD>
                  <TD className="tnum text-right">{formatCurrency(p.acquisitionCost)}</TD>
                  <TD className="tnum text-right">{p.askingPrice ? formatCurrency(p.askingPrice) : "—"}</TD>
                  <TD className="tnum text-right">{formatCurrency(p.currentValuation)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {p.status === "AVAILABLE" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openPartition(p)} disabled={acting}>
                            <Layers className="h-3.5 w-3.5" /> Partition
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openValuate(p)} disabled={acting}>
                            Valuate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(p)} disabled={acting}>
                            Hold
                          </Button>
                        </>
                      )}
                      {p.status === "HOLD" && (
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(p)} disabled={acting}>
                          Release
                        </Button>
                      )}
                      {p.status === "PARTITIONED" && (
                        <span className="text-caption text-muted-foreground">{p.childCount} sub-plots</span>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Dialog>

      {/* Partition Dialog */}
      {partitionParcel && (
        <Dialog
          open={true}
          onOpenChange={(o) => !o && setPartitionParcel(null)}
          title={`Partition ${partitionParcel.number}`}
          description={`Split ${formatNumber(partitionParcel.area, 0)} ${partitionParcel.areaUnit} into sellable sub-plots. Areas must sum exactly to the parent area.`}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            {partitionError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-body text-destructive">
                <AlertCircle className="h-4 w-4" /> {partitionError}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sub-plots</Label>
                <Button type="button" variant="outline" size="sm" onClick={addChild}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {children.map((child, idx) => (
                <div key={child.id} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4 space-y-1">
                    <span className="text-caption text-muted-foreground">Number</span>
                    <Input value={child.number} onChange={(e) => updateChild(idx, "number", e.target.value)} placeholder="PLOT-1A" />
                  </div>
                  <div className="col-span-4 space-y-1">
                    <span className="text-caption text-muted-foreground">Area ({partitionParcel.areaUnit})</span>
                    <Input type="number" min={0} step="any" value={child.area} onChange={(e) => updateChild(idx, "area", e.target.value)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <span className="text-caption text-muted-foreground">Asking Price</span>
                    <Input type="number" min={0} value={child.askingPrice} onChange={(e) => updateChild(idx, "askingPrice", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeChild(idx)} disabled={children.length < 2}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-4 text-body border-t pt-3">
              <span className={Math.abs(areaDiff) < 0.001 ? "tnum text-muted-foreground" : "tnum text-destructive"}>
                Children sum: {formatNumber(childAreaSum, 3)} / Parent: {formatNumber(partitionParcel.area, 3)}
              </span>
              <span className={Math.abs(areaDiff) < 0.001 ? "tnum font-medium text-success" : "tnum text-destructive"}>
                Diff: {areaDiff.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPartitionParcel(null)} disabled={acting}>Cancel</Button>
              <Button onClick={submitPartition} disabled={acting || Math.abs(areaDiff) > 0.001}>
                {acting ? "Partitioning…" : "Confirm Partition"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Valuation Dialog */}
      {valuateParcel && (
        <Dialog
          open={true}
          onOpenChange={(o) => !o && setValuateParcel(null)}
          title={`Valuate ${valuateParcel.number}`}
          description={`Current: ${formatCurrency(valuateParcel.currentValuation)} · Asking: ${valuateParcel.askingPrice ? formatCurrency(valuateParcel.askingPrice) : "—"}`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current Valuation</Label>
              <Input type="number" min={0} value={valuation.currentValuation} onChange={(e) => setValuation((v) => ({ ...v, currentValuation: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Asking Price</Label>
              <Input type="number" min={0} value={valuation.askingPrice} onChange={(e) => setValuation((v) => ({ ...v, askingPrice: e.target.value }))} placeholder="Leave empty to clear" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setValuateParcel(null)} disabled={acting}>Cancel</Button>
              <Button onClick={submitValuation} disabled={acting}>{acting ? "Saving…" : "Update Valuation"}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
