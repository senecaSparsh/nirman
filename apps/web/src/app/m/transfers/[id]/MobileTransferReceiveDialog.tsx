"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import {
  CheckCircle2, X, Package, Truck, Calendar, MapPin, Camera, Loader2,
  RotateCcw, AlertTriangle,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import {
  PhotoCapture, SignaturePad, GeoTagCapture, SelectField, TextField,
  WeighbridgeFields, GeoFenceStatus,
  DELIVERY_MODES, VEHICLE_TYPES,
} from "@/components/mobile/proof-capture";

interface TransferLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  qty: number;
  hsnCode: string | null;
  gstRate: number;
}

/**
 * MobileTransferReceiveDialog — used when a transfer is IN_TRANSIT.
 * The destination receiver confirms receipt with proof (photo, signature, geo).
 * Calls PATCH /api/transfers/[id] with action: "complete" + proof fields.
 */
export function MobileTransferReceiveDialog({
  transferId,
  fromLocationName,
  toLocationName,
  locationLat,
  locationLng,
  locationGeoRadius,
  lines,
}: {
  transferId: string;
  fromLocationName: string;
  toLocationName: string;
  locationLat: number | null;
  locationLng: number | null;
  locationGeoRadius: number | null;
  lines: TransferLine[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Proof fields
  const [photos, setPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; location?: string } | null>(null);
  const [deliveryMode, setDeliveryMode] = useState("");
  const [shortageRemarks, setShortageRemarks] = useState("");
  const [damageRemarks, setDamageRemarks] = useState("");

  // Partial receipt — per-line qty received (defaults to dispatched qty)
  const [lineReceipts, setLineReceipts] = useState<Record<string, string>>({});

  // Supervisor co-signature (optional)
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);

  // Weighbridge fields (bulk material transfers)
  const [wbTicketNo, setWbTicketNo] = useState("");
  const [grossWt, setGrossWt] = useState("");
  const [tareWt, setTareWt] = useState("");
  const [netWt, setNetWt] = useState("");

  // Return to source dialog
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  function ensureLineDefaults() {
    setLineReceipts((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        if (next[l.id] == null || next[l.id] === "") next[l.id] = String(l.qty);
      }
      return next;
    });
  }

  function validateProof(): string | null {
    if (photos.length === 0) return "At least 1 photo is required as proof of receipt";
    if (!signature) return "Receiver e-signature is required";
    if (!geo) return "GPS geo-tag is required";
    if (!deliveryMode) return "Delivery mode is required";
    // Validate partial receipt: each line must have a valid qty ≤ dispatched
    for (const l of lines) {
      const v = Number(lineReceipts[l.id] ?? l.qty);
      if (!Number.isFinite(v) || v < 0) return `Invalid received qty for ${l.materialName}`;
      if (v > l.qty) return `Received qty for ${l.materialName} cannot exceed dispatched qty (${formatNumber(l.qty, 2)})`;
    }
    return null;
  }

  async function confirmReceive() {
    const proofError = validateProof();
    if (proofError) {
      toast.error(proofError);
      return;
    }

    setSubmitting(true);
    haptic(30);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          receiverSignature: signature,
          receiverLat: geo?.lat,
          receiverLng: geo?.lng,
          receiverLocation: geo?.location,
          photos,
          deliveryMode,
          shortageRemarks: shortageRemarks || undefined,
          damageRemarks: damageRemarks || undefined,
          lineReceipts: Object.entries(lineReceipts).map(([lineId, qty]) => ({ lineId, qtyReceived: Number(qty) })),
          supervisorSignature: supervisorSignature ?? undefined,
          weighbridgeTicketNo: wbTicketNo || undefined,
          grossWeight: grossWt ? Number(grossWt) : undefined,
          tareWeight: tareWt ? Number(tareWt) : undefined,
          netWeight: netWt ? Number(netWt) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to confirm receipt");
      }
      toast.success("Transfer received — stock updated", {
        description: `Goods received at ${toLocationName}`,
      });
      setPhotos([]);
      setSignature(null);
      setGeo(null);
      setDeliveryMode("");
      setShortageRemarks("");
      setDamageRemarks("");
      setLineReceipts({});
      setSupervisorSignature(null);
      setWbTicketNo("");
      setGrossWt("");
      setTareWt("");
      setNetWt("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm receipt");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReturnToSource() {
    if (!returnReason.trim()) {
      toast.error("Please enter a reason for returning to source");
      return;
    }
    setSubmitting(true);
    haptic(30);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "returnToSource",
          reason: returnReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to return to source");
      }
      toast.success("Transfer returned to source", {
        description: returnReason.trim(),
      });
      setShowReturn(false);
      setReturnReason("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to return to source");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic(5);
          ensureLineDefaults();
          setOpen(true);
        }}
        className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.75rem] font-bold press transition-colors"
        style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
      >
        <CheckCircle2 className="size-4" />
        Receive at destination
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={() => { if (!submitting) setOpen(false); }}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center size-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <Package className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Receive Transfer</p>
              <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>{fromLocationName} → {toLocationName}</p>
            </div>
          </div>
          <button onClick={() => { if (!submitting) setOpen(false); }} className="press shrink-0 p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Auto-date + location badge */}
        <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-semibold tabular-nums" style={{ color: "var(--color-steel)" }}>
              {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Truck className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-semibold truncate" style={{ color: "var(--color-steel)" }}>{toLocationName}</span>
          </div>
          {geo && locationLat != null && locationLng != null ? (
            <GeoFenceStatus
              ok={(() => {
                const R = 6371000;
                const dLat = (geo.lat - locationLat) * Math.PI / 180;
                const dLng = (geo.lng - locationLng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(locationLat * Math.PI / 180) *
                  Math.cos(geo.lat * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
                const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return dist <= (locationGeoRadius ?? 500);
              })()}
            />
          ) : null}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Line items — editable qty for partial receipt */}
          <div className="p-3 space-y-2">
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
              Items ({lines.length}) — enter received qty
            </p>
            {lines.map((l) => {
              const recvQty = lineReceipts[l.id] ?? String(l.qty);
              const recvNum = Number(recvQty);
              const isPartial = Number.isFinite(recvNum) && recvNum < l.qty;
              return (
                <div key={l.id} className="flex items-center gap-2 rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</p>
                    <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>{l.materialCode}</p>
                    {/* HSN/GST badge — shows compliance status */}
                    <div className="flex items-center gap-1 mt-0.5">
                      {l.hsnCode ? (
                        <span className="text-[0.4375rem] font-semibold rounded px-1 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}>
                          HSN {l.hsnCode} · GST {l.gstRate}%
                        </span>
                      ) : (
                        <span className="text-[0.4375rem] font-semibold rounded px-1 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 10%, transparent)", color: "var(--color-stop)" }}>
                          ⚠ No HSN/GST — will auto-fill on receive
                        </span>
                      )}
                    </div>
                    <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-steel)" }}>
                      Dispatched: <span className="tabular-nums font-semibold">{formatNumber(l.qty, 2)}</span> {l.materialUnit}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      max={l.qty}
                      value={recvQty}
                      onChange={(e) => setLineReceipts((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      className="w-20 h-8 rounded-[0.375rem] border px-2 text-[0.6875rem] text-right tabular-nums font-bold outline-none"
                      style={{
                        borderColor: isPartial ? "var(--color-signal-dark)" : "var(--color-line)",
                        backgroundColor: isPartial ? "color-mix(in srgb, var(--color-signal-dark) 6%, transparent)" : "var(--color-paper-2)",
                        color: "var(--color-ink-950)",
                      }}
                    />
                    <p className="text-[0.5rem]" style={{ color: isPartial ? "var(--color-signal-dark)" : "var(--color-ink-500)" }}>
                      {l.materialUnit}{isPartial ? " · partial" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Delivery mode */}
          <div className="px-3 pb-3 space-y-2.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Delivery</p>
            <SelectField label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} options={DELIVERY_MODES} required />
          </div>

          {/* Proof of receipt — mandatory */}
          <div className="px-3 pb-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-stop)" }}>
              Proof of Receipt (Mandatory)
            </p>
            <PhotoCapture photos={photos} onChange={setPhotos} mandatory />
            <SignaturePad value={signature} onChange={setSignature} mandatory />
            <GeoTagCapture lat={geo?.lat ?? null} lng={geo?.lng ?? null} location={geo?.location ?? null} onChange={setGeo} mandatory />
          </div>

          {/* Supervisor co-signature (optional) */}
          <div className="px-3 pb-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Supervisor Signature (optional)
            </p>
            <SignaturePad value={supervisorSignature} onChange={setSupervisorSignature} />
          </div>

          {/* Weighbridge fields (bulk material transfers) */}
          <div className="px-3 pb-3 space-y-2.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Weighbridge (optional)</p>
            <WeighbridgeFields
              ticketNo={wbTicketNo} onTicketNoChange={setWbTicketNo}
              grossWeight={grossWt} onGrossChange={setGrossWt}
              tareWeight={tareWt} onTareChange={setTareWt}
              netWeight={netWt} onNetChange={setNetWt}
            />
          </div>

          {/* Remarks */}
          <div className="px-3 pb-3 space-y-2.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Remarks</p>
            <TextField label="Shortage Remarks" value={shortageRemarks} onChange={setShortageRemarks} placeholder="If any shortage observed" />
            <TextField label="Damage Remarks" value={damageRemarks} onChange={setDamageRemarks} placeholder="If any damage observed" />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-3 space-y-2" style={{ borderColor: "var(--color-line)" }}>
          <button type="button" onClick={confirmReceive} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-go)", color: "#fff" }}>
            {submitting ? (<><div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Receiving…</>) : (<><CheckCircle2 className="size-4" />Confirm — update stock</>)}
          </button>
          <button
            type="button"
            onClick={() => { haptic(10); setShowReturn(true); }}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "transparent", color: "var(--color-stop)", border: "1px solid var(--color-stop)" }}
          >
            <RotateCcw className="size-3.5" />
            Return to Source
          </button>
        </div>
      </div>

      {/* Return to source dialog */}
      {showReturn ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => { if (!submitting) setShowReturn(false); }}>
          <div className="w-full max-w-md rounded-t-[0.75rem] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Return to Source?</p>
              <button onClick={() => { if (!submitting) setShowReturn(false); }} className="press shrink-0 p-1 ml-auto">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
                Goods are damaged or wrong? Return this transfer to {fromLocationName}. A reason is required.
              </p>
              <TextField label="Reason" value={returnReason} onChange={setReturnReason} placeholder="e.g. Goods damaged in transit" required />
              <div className="flex gap-2">
                <button onClick={() => setShowReturn(false)} disabled={submitting} className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>Cancel</button>
                <button onClick={() => void confirmReturnToSource()} disabled={submitting} className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <><RotateCcw className="size-3.5" /><span>Return to Source</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * MobileTransferDispatchDialog — used when a transfer is DRAFT.
 * The source dispatcher marks goods as dispatched (handed to transport).
 * Calls PATCH /api/transfers/[id] with action: "dispatch" + transport details.
 */
export function MobileTransferDispatchDialog({
  transferId,
  fromLocationName,
  toLocationName,
  lines,
  onDispatched,
}: {
  transferId: string;
  fromLocationName: string;
  toLocationName: string;
  lines: TransferLine[];
  onDispatched?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Transport fields
  const [deliveryMode, setDeliveryMode] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [packageCount, setPackageCount] = useState("");

  // Dispatch proof (mandatory)
  const [dispatchPhotos, setDispatchPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [dispatchSignature, setDispatchSignature] = useState<string | null>(null);

  const isHandCarry = deliveryMode === "HAND_CARRY";
  const needsVehicleFields = !isHandCarry;

  function validate(): string | null {
    if (!deliveryMode) return "Delivery mode is required";
    if (needsVehicleFields) {
      if (!vehicleType) return "Vehicle type is required";
      if (!vehicleNumber) return "Vehicle number is required";
    }
    if (dispatchPhotos.length === 0) return "At least 1 dispatch photo is required as proof";
    if (!dispatchSignature) return "Dispatcher e-signature is required";
    return null;
  }

  async function confirmDispatch() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    haptic(30);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          vehicleType: needsVehicleFields ? vehicleType : undefined,
          vehicleNumber: needsVehicleFields ? vehicleNumber : undefined,
          driverName: needsVehicleFields ? driverName : undefined,
          driverPhone: needsVehicleFields ? driverPhone : undefined,
          transporterName: deliveryMode === "THIRD_PARTY" ? transporterName : undefined,
          challanNumber: challanNumber || undefined,
          packageCount: packageCount ? Number(packageCount) : undefined,
          dispatchPhotos,
          dispatchSignature,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to dispatch");
      }
      toast.success("Transfer dispatched", {
        description: `Goods handed over for ${fromLocationName} → ${toLocationName}`,
      });
      setDeliveryMode("");
      setVehicleType("");
      setVehicleNumber("");
      setDriverName("");
      setDriverPhone("");
      setTransporterName("");
      setChallanNumber("");
      setPackageCount("");
      setDispatchPhotos([]);
      setDispatchSignature(null);
      setOpen(false);
      if (onDispatched) onDispatched();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dispatch");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic(5);
          setOpen(true);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95"
        style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}
      >
        <Truck className="size-4" />
        Dispatch
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={() => { if (!submitting) setOpen(false); }}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center size-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
              <Truck className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Dispatch Transfer</p>
              <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>{fromLocationName} → {toLocationName}</p>
            </div>
          </div>
          <button onClick={() => { if (!submitting) setOpen(false); }} className="press shrink-0 p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Auto-date */}
        <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-semibold tabular-nums" style={{ color: "var(--color-steel)" }}>
              {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Line items summary */}
          <div className="p-3 space-y-2">
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
              Items ({lines.length})
            </p>
            {lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</p>
                  <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>{l.materialCode}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatNumber(l.qty, 2)}</p>
                  <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>{l.materialUnit}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Transport details */}
          <div className="px-3 pb-3 space-y-2.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Transport Details</p>
            <SelectField label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} options={DELIVERY_MODES} required />
            {needsVehicleFields ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label="Vehicle Type" value={vehicleType} onChange={setVehicleType} options={VEHICLE_TYPES} required />
                  <TextField label="Vehicle No." value={vehicleNumber} onChange={setVehicleNumber} placeholder="MH-12-AB-1234" required mono />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TextField label="Driver Name" value={driverName} onChange={setDriverName} placeholder="Driver name" />
                  <TextField label="Driver Phone" value={driverPhone} onChange={setDriverPhone} placeholder="9876543210" />
                </div>
                {deliveryMode === "THIRD_PARTY" ? (
                  <TextField label="Transporter Name" value={transporterName} onChange={setTransporterName} placeholder="ABC Transport Co." />
                ) : null}
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Challan No." value={challanNumber} onChange={setChallanNumber} placeholder="Dispatch challan" mono />
              <TextField label="Package Count" value={packageCount} onChange={setPackageCount} placeholder="0" />
            </div>
          </div>

          {/* Dispatch Proof — mandatory */}
          <div className="px-3 pb-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-stop)" }}>
              Dispatch Proof (Mandatory)
            </p>
            <PhotoCapture photos={dispatchPhotos} onChange={setDispatchPhotos} mandatory />
            <SignaturePad value={dispatchSignature} onChange={setDispatchSignature} mandatory />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
          <button type="button" onClick={confirmDispatch} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}>
            {submitting ? (<><div className="size-4 rounded-full border-2 border-ink-950/30 border-t-ink-950 animate-spin" />Dispatching…</>) : (<><Truck className="size-4" />Dispatch — mark as in transit</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
