"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, ArrowRight, ChevronDown, ChevronRight, Truck, Scale, Camera } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PurchaseOrderDetail } from "@/lib/types";

type RecvLine = {
  lineId: string;
  materialId: string;
  materialName: string;
  unit: string;
  baseUnit: string;
  uomConversionFactor: number | null;
  qtyOrdered: number;
  qtyReceived: number;
  remaining: number;
  defaultCost: number;
  qtyToReceive: string;
  unitCost: string;
  weightReceived: string;
};

/** Column definitions for the receive-goods editable grid. */
const recvColumns: EditableColumn<RecvLine>[] = [
  {
    key: "materialName",
    label: "Material",
    type: "readonly",
    width: "1fr",
  },
  {
    key: "qtyOrdered",
    label: "Ordered",
    type: "readonly",
    align: "right",
    format: (v) => formatNumber(v as number, 3),
  },
  {
    key: "remaining",
    label: "Remaining",
    type: "readonly",
    align: "right",
    format: (v) => formatNumber(v as number, 3),
  },
  {
    key: "weightReceived",
    label: "Weight (KG)",
    type: "number",
    align: "right",
    step: "0.001",
    min: 0,
    placeholder: "—",
    width: "100px",
    format: (v) => v ? formatNumber(Number(v), 3) : "",
  },
  {
    key: "qtyToReceive",
    label: "Qty to Receive",
    type: "number",
    align: "right",
    step: "0.001",
    min: 0,
    placeholder: "0",
    width: "110px",
    format: (v) => v ? formatNumber(Number(v), 3) : "",
  },
  {
    key: "unitCost",
    label: "Unit Cost (₹)",
    type: "number",
    align: "right",
    step: "0.01",
    min: 0,
    width: "110px",
    format: (v) => v ? formatCurrency(Number(v)) : "",
  },
  {
    key: "lineTotal",
    label: "Line Total",
    type: "computed",
    align: "right",
    compute: (r) => (Number(r.qtyToReceive) || 0) * (Number(r.unitCost) || 0),
    format: (v) => formatCurrency(v as number),
  },
];

export function ReceiveGoodsDialog({
  open,
  onOpenChange,
  po,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrderDetail | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Build receive lines from PO lines that still have remaining qty
  const [lines, setLines] = useState<RecvLine[]>([]);

  // ── Delivery details (collapsible) ──
  const [showDelivery, setShowDelivery] = useState(false);
  const [gateEntryNo, setGateEntryNo] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporterName, setTransporterName] = useState("");
  // Weighbridge
  const [wbTicketNo, setWbTicketNo] = useState("");
  const [wbGross, setWbGross] = useState("");
  const [wbTare, setWbTare] = useState("");
  const [wbNet, setWbNet] = useState("");
  // Unloading + shortage
  const [unloadingSlipNo, setUnloadingSlipNo] = useState("");
  const [unloadingLocation, setUnloadingLocation] = useState("");
  const [unloadingRemarks, setUnloadingRemarks] = useState("");
  const [shortageRemarks, setShortageRemarks] = useState("");
  const [receivingPhotoUrl, setReceivingPhotoUrl] = useState("");

  // Re-init lines when PO changes
  function ensureLines() {
    if (po && lines.length === 0) {
      setLines(
        po.lines
          .filter((l) => l.remaining > 0)
          .map((l) => ({
            lineId: l.id,
            materialId: l.materialId,
            materialName: l.materialName,
            unit: l.unit,
            baseUnit: l.baseUnit,
            uomConversionFactor: l.uomConversionFactor,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
            remaining: l.remaining,
            defaultCost: l.unitCost,
            qtyToReceive: "",
            unitCost: String(l.unitCost),
            weightReceived: "",
          })),
      );
    }
  }

  function updateLine(lineId: string, patch: Partial<RecvLine>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.lineId !== lineId) return l;
        const next = { ...l, ...patch };
        // Auto-calculate qty from weight when conversion factor exists
        if (patch.weightReceived !== undefined && l.uomConversionFactor && l.uomConversionFactor > 0) {
          const wt = Number(patch.weightReceived);
          if (wt > 0) {
            next.qtyToReceive = (wt / l.uomConversionFactor).toFixed(3);
          } else if (patch.weightReceived === "") {
            next.qtyToReceive = "";
          }
        }
        return next;
      }),
    );
  }

  // Intercept grid changes to auto-calc qty from weight
  function handleGridChange(newRows: RecvLine[]) {
    setLines(newRows.map((r) => {
      if (r.uomConversionFactor && r.uomConversionFactor > 0 && r.weightReceived) {
        const wt = Number(r.weightReceived);
        if (wt > 0) {
          return { ...r, qtyToReceive: (wt / r.uomConversionFactor).toFixed(3) };
        }
      }
      return r;
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!po) return;
    const toReceive = lines.filter((l) => Number(l.qtyToReceive) > 0);
    if (toReceive.length === 0) return toast.error("Enter a quantity to receive for at least one line");

    // Validate no over-receipt
    for (const l of toReceive) {
      if (Number(l.qtyToReceive) > l.remaining) {
        return toast.error(`Cannot receive ${l.qtyToReceive} ${l.unit} of ${l.materialName} — only ${l.remaining} remaining`);
      }
    }

    setSaving(true);
    try {
      const isHandCarry = deliveryMode === "HAND_CARRY";
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          lines: toReceive.map((l) => ({
            purchaseOrderLineId: l.lineId,
            materialId: l.materialId,
            qtyReceived: Number(l.qtyToReceive),
            unitCost: Number(l.unitCost) || 0,
          })),
          // Gate entry / dispatch docs
          gatePassNo: gateEntryNo.trim() || undefined,
          challanNumber: challanNo.trim() || undefined,
          invoiceNumber: invoiceNo.trim() || undefined,
          // Delivery mode
          deliveryMode: deliveryMode || undefined,
          // Vehicle/transport — skip for hand carry
          vehicleType: isHandCarry ? undefined : (vehicleType || undefined),
          vehicleNumber: isHandCarry ? undefined : (vehicleNumber.trim() || undefined),
          driverName: isHandCarry ? undefined : (driverName.trim() || undefined),
          driverPhone: isHandCarry ? undefined : (driverPhone.trim() || undefined),
          transporterName: deliveryMode === "THIRD_PARTY" ? (transporterName.trim() || undefined) : undefined,
          // Weighbridge (kanta parchi)
          weighbridgeTicketNo: wbTicketNo.trim() || undefined,
          grossWeight: wbGross ? Number(wbGross) : undefined,
          tareWeight: wbTare ? Number(wbTare) : undefined,
          netWeight: wbNet ? Number(wbNet) : undefined,
          // Unloading + shortage
          unloadingSlipNo: unloadingSlipNo.trim() || undefined,
          unloadingLocation: unloadingLocation.trim() || undefined,
          unloadingRemarks: unloadingRemarks.trim() || undefined,
          shortageRemarks: shortageRemarks.trim() || undefined,
          receivingPhotoUrl: receivingPhotoUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to receive goods");

      // Build a detailed confirmation toast with stock landing info
      const receivedSummary = toReceive
        .map((l) => `${l.qtyToReceive} ${l.unit} ${l.materialName}`)
        .join(", ");
      const isProjectScoped = po.procurementScope === "PROJECT" && po.projectId;
      toast.success(`GRN done — PO is now ${data.newStatus}`, {
        description: `${receivedSummary} → ${po.destinationLocation.name}`,
        action: {
          label: isProjectScoped ? "Issue to Project" : "View Stock Movements",
          onClick: () => router.push(isProjectScoped ? `/stock?issue=1&project=${po.projectId}` : "/stock?tab=movements"),
        },
      });
      onOpenChange(false);
      // Reset all form fields
      setLines([]);
      setNotes("");
      setGateEntryNo(""); setChallanNo(""); setInvoiceNo("");
      setDeliveryMode(""); setVehicleNumber(""); setVehicleType("");
      setDriverName(""); setDriverPhone(""); setTransporterName("");
      setWbTicketNo(""); setWbGross(""); setWbTare(""); setWbNet("");
      setUnloadingSlipNo(""); setUnloadingLocation(""); setUnloadingRemarks(""); setShortageRemarks(""); setReceivingPhotoUrl("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (!po) return null;
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const receivableLines = po.lines.filter((l) => l.remaining > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setLines([]); setNotes(""); setGateEntryNo(""); setChallanNo(""); setInvoiceNo(""); setDeliveryMode(""); setVehicleNumber(""); setVehicleType(""); setDriverName(""); setDriverPhone(""); setTransporterName(""); setWbTicketNo(""); setWbGross(""); setWbTare(""); setWbNet(""); setUnloadingSlipNo(""); setUnloadingLocation(""); setUnloadingRemarks(""); setShortageRemarks(""); setReceivingPhotoUrl(""); } }}
      title={`Make GRN — ${po.poNumber}`}
      description={`Supplier: ${po.supplier.name} · Receiving at: ${po.destinationLocation.name}`}
      className="max-w-2xl"
    >
      {!canReceive ? (
        <div className="space-y-3">
          <p className="text-body text-muted-foreground">
            This PO is in status <strong>{po.status}</strong>. Goods can only be received against POs
            that are ORDERED or PARTIAL.
          </p>
          <div className="flex gap-2">
            <a href={`/procurement/${po.id}`} className="inline-flex">
              <Button variant="default" size="sm">
                {po.status === "DRAFT" ? "Approve / Order this PO →" : "View PO →"}
              </Button>
            </a>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      ) : receivableLines.length === 0 ? (
        <div className="space-y-3">
          <p className="text-body text-muted-foreground">All lines on this PO have been fully received.</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" onFocus={ensureLines}>
          {lines.length > 0 && (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLines((ls) => ls.map((l) => ({
                      ...l,
                      qtyToReceive: l.remaining > 0 ? String(l.remaining) : "",
                    })));
                    toast.success("Filled all remaining quantities");
                  }}
                >
                  Receive All Remaining
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <EditableGrid
                  rows={lines}
                  onChange={handleGridChange}
                  columns={recvColumns}
                  getRowId={(r) => r.lineId}
                  sumColumns={["qtyToReceive", "lineTotal"]}
                  className="max-h-[50vh]"
                />
              </div>
              {lines.some((l) => l.uomConversionFactor && l.uomConversionFactor > 0) && (
                <p className="text-xs text-muted-foreground">
                  💡 Enter weight in the &quot;Weight&quot; column — qty auto-calculates from the material&apos;s UOM conversion factor (e.g., 5000 KG ÷ 50 = 100 BAG).
                </p>
              )}
              {/* Compact impact strip — receiving value + GST at a glance */}
              {(() => {
                const recvLines = lines.filter((l) => Number(l.qtyToReceive) > 0);
                if (recvLines.length === 0) return null;
                // Compute GST per-line — PO lines may have different GST rates
                let subtotal = 0, gst = 0;
                for (const l of recvLines) {
                  const lineSub = (Number(l.qtyToReceive) || 0) * (Number(l.unitCost) || 0);
                  const poLine = po.lines.find((pl) => pl.materialId === l.materialId);
                  const rate = poLine?.gstRate ?? 0;
                  subtotal += lineSub;
                  gst += lineSub * rate / 100;
                }
                const total = subtotal + gst;
                return (
                  <div className="flex items-center justify-end gap-2 text-caption text-muted-foreground">
                    <span className="tnum">{recvLines.length} line{recvLines.length !== 1 ? "s" : ""}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="tnum">Subtotal <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span></span>
                    {gst > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="tnum">GST <span className="font-semibold text-foreground">{formatCurrency(gst)}</span></span>
                      </>
                    )}
                    <span className="text-muted-foreground/40">·</span>
                    <span className="tnum font-semibold text-foreground">{formatCurrency(total)}</span>
                    <span className="text-muted-foreground">→ {po.destinationLocation.name}</span>
                  </div>
                );
              })()}
            </>
          )}
          <div className="space-y-1.5">
            <Label>GRN notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — any additional remarks" />
          </div>

          {/* ── Delivery details (collapsible) ── */}
          <button
            type="button"
            onClick={() => setShowDelivery((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showDelivery ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Truck className="size-4" />
            Delivery details
            {(gateEntryNo || challanNo || vehicleNumber || wbTicketNo) ? (
              <span className="ml-1 text-xs font-bold text-success">✓ filled</span>
            ) : null}
          </button>

          {showDelivery && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
              {/* Gate entry + challan + invoice */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Gate Entry No.</Label>
                  <Input
                    placeholder="GE-2026-081"
                    value={gateEntryNo}
                    onChange={(e) => setGateEntryNo(e.target.value)}
                    className="font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Challan No.</Label>
                  <Input
                    placeholder="Supplier dispatch no."
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    className="font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Invoice No.</Label>
                  <Input
                    placeholder="Supplier invoice no."
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="font-mono text-sm mt-1"
                  />
                </div>
              </div>

              {/* Delivery mode */}
              <div>
                <Label className="text-xs">Delivery Mode</Label>
                <Select
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Select…</option>
                  <option value="SUPPLIER_VEHICLE">Supplier Vehicle</option>
                  <option value="OWN_VEHICLE">Own Vehicle</option>
                  <option value="THIRD_PARTY">3rd Party Transport</option>
                  <option value="HAND_CARRY">Hand Carry</option>
                </Select>
              </div>

              {/* Vehicle details — hidden for hand carry */}
              {deliveryMode && deliveryMode !== "HAND_CARRY" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Vehicle No.</Label>
                    <Input
                      placeholder="MH-12-AB-1234"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      className="font-mono text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vehicle Type</Label>
                    <Select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="mt-1"
                    >
                      <option value="">Select…</option>
                      <option value="TRUCK">Truck</option>
                      <option value="TEMPO">Tempo</option>
                      <option value="PICKUP">Pickup</option>
                      <option value="TRACTOR">Tractor</option>
                      <option value="MINI_TRUCK">Mini Truck</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Driver Name</Label>
                    <Input
                      placeholder="Driver name"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Driver Phone</Label>
                    <Input
                      placeholder="9876543210"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      className="font-mono text-sm mt-1"
                    />
                  </div>
                  {deliveryMode === "THIRD_PARTY" && (
                    <div className="col-span-2">
                      <Label className="text-xs">Transporter Name</Label>
                      <Input
                        placeholder="Transport company name"
                        value={transporterName}
                        onChange={(e) => setTransporterName(e.target.value)}
                        className="text-sm mt-1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Weighbridge (kanta parchi) — for bulk materials */}
              <div className="border-t border-border pt-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Scale className="size-3.5 text-muted-foreground" />
                  <Label className="text-xs">Weighbridge (Kanta Parchi)</Label>
                  <span className="text-xs text-muted-foreground">— for bulk materials</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Slip No.</Label>
                    <Input
                      placeholder="KP-001"
                      value={wbTicketNo}
                      onChange={(e) => setWbTicketNo(e.target.value)}
                      className="font-mono text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Gross (kg)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="0"
                      value={wbGross}
                      onChange={(e) => {
                        setWbGross(e.target.value);
                        const g = Number(e.target.value);
                        const t = Number(wbTare);
                        if (wbTare && !isNaN(g) && !isNaN(t) && g - t >= 0) setWbNet(String(g - t));
                      }}
                      className="text-right text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tare (kg)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="0"
                      value={wbTare}
                      onChange={(e) => {
                        setWbTare(e.target.value);
                        const g = Number(wbGross);
                        const t = Number(e.target.value);
                        if (wbGross && !isNaN(g) && !isNaN(t) && g - t >= 0) setWbNet(String(g - t));
                      }}
                      className="text-right text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Net (kg)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="0"
                      value={wbNet}
                      onChange={(e) => setWbNet(e.target.value)}
                      className="text-right text-sm mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Unloading + Shortage */}
              <div className="border-t border-border pt-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Package className="size-3.5 text-muted-foreground" />
                  <Label className="text-xs">Unloading & Shortage</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Unloading Slip No.</Label>
                    <Input
                      placeholder="US-2024-001"
                      value={unloadingSlipNo}
                      onChange={(e) => setUnloadingSlipNo(e.target.value)}
                      className="font-mono text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unloading Location</Label>
                    <Input
                      placeholder="Bay 1, Yard A…"
                      value={unloadingLocation}
                      onChange={(e) => setUnloadingLocation(e.target.value)}
                      className="text-sm mt-1"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Unloading Remarks</Label>
                  <Textarea
                    placeholder="Damage during unloading, stacking notes…"
                    value={unloadingRemarks}
                    onChange={(e) => setUnloadingRemarks(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Shortage Remarks</Label>
                  <Textarea
                    placeholder="Shortages, missing items, quantity discrepancies…"
                    value={shortageRemarks}
                    onChange={(e) => setShortageRemarks(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Receiving Photo URL</Label>
                  <Input
                    placeholder="https://… (photo of receiving slip when no gate pass)"
                    value={receivingPhotoUrl}
                    onChange={(e) => setReceivingPhotoUrl(e.target.value)}
                    className="text-sm mt-1"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Receiving…" : "Receive goods"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
