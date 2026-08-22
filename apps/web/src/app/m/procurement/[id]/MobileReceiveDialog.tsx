"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import {
  ScanLine, CheckCircle2, X, Package, Truck, Calendar, XCircle, Scale, Plus, AlertCircle, Printer, FileText,
} from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  PhotoCapture, SignaturePad, GeoTagCapture, SelectField, TextField,
  WeighbridgeFields, GeoFenceStatus, ReceivingPhotoUpload,
  DELIVERY_MODES, VEHICLE_TYPES, INSPECTION_STATUSES,
} from "@/components/mobile/proof-capture";

interface ReceiveLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  baseUnit: string;
  secondaryUnit: string | null;
  uomConversionFactor: number | null;
}

interface ConfirmLine {
  name: string;
  qty: number;
  unit: string;
  cost: number;
  weight?: string;
  shortage: number;
  full: boolean;
}

// Haversine distance in meters between two lat/lng points
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MobileReceiveDialog({
  poId,
  poNumber,
  supplierId,
  supplierName,
  locationId,
  locationName,
  locationLat,
  locationLng,
  locationGeoRadius,
  lines,
  deliveryTermsType,
}: {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  locationGeoRadius: number | null;
  lines: ReceiveLine[];
  deliveryTermsType?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"receive" | "reject">("receive");
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [lineLots, setLineLots] = useState<Record<string, string>>({});
  const [lineBatches, setLineBatches] = useState<Record<string, string>>({});
  const [lineInspection, setLineInspection] = useState<Record<string, string>>({});
  // Weight-based receiving: per-line toggle + weight input
  const [lineByWeight, setLineByWeight] = useState<Record<string, boolean>>({});
  const [lineWeights, setLineWeights] = useState<Record<string, string>>({});
  const [gatePassNo, setGatePassNo] = useState("");
  // "Gate Pass" mode = enter supplier's gate pass number (text)
  // "Receiving" mode = no gate pass, upload photo of company receiving (chota-mota kaam)
  const [gatePassMode, setGatePassMode] = useState<"gatePass" | "receiving">("gatePass");
  const [receivingPhoto, setReceivingPhoto] = useState<{ url: string; fileName?: string } | null>(null);
  const [receiptNotes, setReceiptNotes] = useState("");
  const [confirmLines, setConfirmLines] = useState<ConfirmLine[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastGrnId, setLastGrnId] = useState<string | null>(null);
  const [lastNewStatus, setLastNewStatus] = useState<string | null>(null);

  // Proof fields
  const [photos, setPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; location?: string } | null>(null);
  const [deliveryMode, setDeliveryMode] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [ewayBillNumber, setEwayBillNumber] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [packageCount, setPackageCount] = useState("");
  const [shortageRemarks, setShortageRemarks] = useState("");
  const [damageRemarks, setDamageRemarks] = useState("");

  // Weighbridge
  const [wbTicketNo, setWbTicketNo] = useState("");
  const [grossWt, setGrossWt] = useState("");
  const [tareWt, setTareWt] = useState("");
  const [netWt, setNetWt] = useState("");

  // Unloading
  const [unloadingSlipNo, setUnloadingSlipNo] = useState("");
  const [unloadingLocation, setUnloadingLocation] = useState("");
  const [unloadingRemarks, setUnloadingRemarks] = useState("");

  // Quick-add material state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddCategory, setQuickAddCategory] = useState("");
  const [quickAddUnit, setQuickAddUnit] = useState("NOS");
  const [quickAddCost, setQuickAddCost] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Reject fields
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPhotos, setRejectPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const isExWorks = deliveryTermsType === "EX_WORKS";
  const isForStation = deliveryTermsType === "FOR_STATION";
  const isDeliveredSite = deliveryTermsType === "DELIVERED_SITE" || !deliveryTermsType;
  const isHandCarry = deliveryMode === "HAND_CARRY";
  const needsVehicleFields = !isHandCarry;

  // Whether any line supports weight conversion (controls weighbridge section visibility)
  const hasConvertibleLines = lines.some((l) => hasWeightConversion(l));

  // Non-quantifiable (bulk/loose) materials — measured in CFT, BRASS, TON, CUM, LTR, etc.
  // These can't be counted; they MUST be weighed → kata parchi is MANDATORY.
  // Quantifiable materials (BAG, NOS, PIECE, BOX, SET, ROLL, BUNDLE, COIL) → kata parchi is OPTIONAL.
  const BULK_UNITS = ["CFT", "BRASS", "TON", "CUM", "M3", "LTR", "LIT", "GAL", "KG", "QUINTAL", "MT"];
  function isBulkUnit(unit: string): boolean {
    return BULK_UNITS.includes(unit.toUpperCase());
  }
  const hasBulkLines = lines.some((l) => isBulkUnit(l.unit));
  const kataParchiRequired = hasBulkLines;

  // ── Automation: pre-fill fields when dialog opens ──
  // Fires once when the dialog opens. Reduces manual taps from ~15 to ~5.
  const autoCaptureGps = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeo({ lat, lng, location: locationName || undefined });
        // Geo-fence check — warn if receiver is far from expected location
        if (locationLat !== null && locationLng !== null && locationGeoRadius) {
          const dist = haversineMeters(lat, lng, locationLat, locationLng);
          if (dist > locationGeoRadius) {
            toast.warning(`You are ${(dist / 1000).toFixed(1)} km from ${locationName}`, {
              description: `Expected within ${locationGeoRadius} m. Verify you are at the correct site.`,
            });
          }
        }
      },
      () => { /* silent fail — user can retry manually */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, [locationName, locationLat, locationLng, locationGeoRadius]);

  // Track whether auto-fill has run, so we don't overwrite user edits
  const autoFilledRef = useRef({ vehicle: false, gateEntry: false });

  useEffect(() => {
    if (!open) return;
    // Reset auto-fill tracking on each open
    autoFilledRef.current = { vehicle: false, gateEntry: false };

    // 1. Auto-default inspection to PENDING for all lines (saves N taps)
    const defaultInspection: Record<string, string> = {};
    lines.forEach((l) => { defaultInspection[l.id] = "PENDING"; });
    setLineInspection(defaultInspection);

    // 2. Auto-default delivery mode from PO delivery terms (receive mode only)
    if (mode === "receive") {
      if (isExWorks) setDeliveryMode("OWN_VEHICLE");
      else if (isForStation) setDeliveryMode("THIRD_PARTY");
      else setDeliveryMode("SUPPLIER_VEHICLE");
    }

    // 3. Auto-capture GPS (silent — user sees the green check appear)
    autoCaptureGps();

    // 4. Auto-fill vehicle/driver from supplier's last GRN (receive mode only)
    if (mode === "receive") {
      fetch(`/api/suppliers/${supplierId}/last-grn`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data || autoFilledRef.current.vehicle) return;
          autoFilledRef.current.vehicle = true;
          if (data.vehicleNumber) setVehicleNumber(data.vehicleNumber);
          if (data.vehicleType) setVehicleType(data.vehicleType);
          if (data.driverName) setDriverName(data.driverName);
          if (data.driverPhone) setDriverPhone(data.driverPhone);
          if (data.transporterName) setTransporterName(data.transporterName);
        })
        .catch(() => { /* silent — not critical */ });

      // 5. Auto-generate sequential unloading slip number from DB
      //    Gate pass no. is NOT auto-generated — it comes from the supplier's document.
      if (!autoFilledRef.current.gateEntry) {
        autoFilledRef.current.gateEntry = true;
        fetch(`/api/gate-entry/next?locationId=${locationId}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.unloadingSlipNo) setUnloadingSlipNo(data.unloadingSlipNo);
          })
          .catch(() => {
            const now = new Date();
            const ts = String(now.getTime()).slice(-6);
            setUnloadingSlipNo(`US-${now.getFullYear()}-${ts}`);
          });
      }
    }

    // NOTE: Package count is NOT auto-filled — it's too material-specific
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setQty(lineId: string, qty: string) {
    setReceipts((r) => ({ ...r, [lineId]: qty }));
  }

  // ── Weight → Qty conversion ──
  // If a material has a uomConversionFactor (e.g., 1 BAG = 50 KG),
  // entering weight in baseUnit (KG) auto-calculates qty in the transaction unit (BAG).
  function hasWeightConversion(line: ReceiveLine): boolean {
    return !!line.uomConversionFactor && line.uomConversionFactor > 0 && !!line.baseUnit;
  }

  function calcQtyFromWeight(weight: number, line: ReceiveLine): number {
    if (!line.uomConversionFactor || line.uomConversionFactor <= 0) return 0;
    return weight / line.uomConversionFactor;
  }

  function setLineWeight(lineId: string, weight: string) {
    setLineWeights((w) => ({ ...w, [lineId]: weight }));
    // Auto-calculate qty from weight
    const line = lines.find((l) => l.id === lineId);
    if (line && hasWeightConversion(line)) {
      const wt = Number(weight);
      if (wt > 0) {
        const qty = calcQtyFromWeight(wt, line);
        setReceipts((r) => ({ ...r, [lineId]: qty.toFixed(3) }));
      } else {
        setReceipts((r) => ({ ...r, [lineId]: "" }));
      }
    }
  }

  function toggleByWeight(lineId: string) {
    const wasByWeight = !!lineByWeight[lineId];
    setLineByWeight((s) => ({ ...s, [lineId]: !wasByWeight }));
    // When switching modes, clear both weight and qty so stale values don't leak
    setLineWeights((w) => ({ ...w, [lineId]: "" }));
    setReceipts((r) => ({ ...r, [lineId]: "" }));
  }

  // Fill a line's weight from the GRN-level weighbridge net weight
  function useWeighbridgeForLine(lineId: string) {
    if (!netWt) return;
    setLineWeight(lineId, netWt);
  }

  // "Receive Full" — fill all remaining lines with their full remaining qty
  function receiveFull() {
    haptic(10);
    const newReceipts: Record<string, string> = {};
    const newWeights: Record<string, string> = {};
    lines.forEach((l) => {
      const remaining = l.qtyOrdered - l.qtyReceived;
      if (remaining > 0) {
        newReceipts[l.id] = String(remaining);
        // Only fill weight if this line is currently in byWeight mode
        if (hasWeightConversion(l) && lineByWeight[l.id]) {
          newWeights[l.id] = (remaining * l.uomConversionFactor!).toFixed(3);
        }
      }
    });
    setReceipts((r) => ({ ...r, ...newReceipts }));
    setLineWeights((w) => ({ ...w, ...newWeights }));
  }

  // Auto-detect shortage/over-delivery per line
  function getLineStatus(line: ReceiveLine): "full" | "partial" | "short" | "over" | "none" {
    const qty = Number(receipts[line.id] ?? 0);
    if (qty <= 0) return "none";
    const remaining = line.qtyOrdered - line.qtyReceived;
    if (qty > remaining) return "over";
    if (qty === remaining) return "full";
    return "partial";
  }

  // Expected weight when counting manually (for verification)
  function expectedWeight(line: ReceiveLine): number | null {
    if (!hasWeightConversion(line)) return null;
    const qty = Number(receipts[line.id] ?? 0);
    if (qty <= 0) return null;
    return qty * line.uomConversionFactor!;
  }

  async function loadCategories() {
    if (categories.length > 0) return;
    try {
      const res = await fetch("/api/material-categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* best-effort */ }
  }

  async function handleQuickAdd() {
    if (!quickAddName.trim() || !quickAddCategory) {
      toast.error("Material name and category are required");
      return;
    }
    setQuickAddLoading(true);
    haptic(10);
    try {
      const res = await fetch("/api/materials/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickAddName.trim(),
          categoryId: quickAddCategory,
          unit: quickAddUnit,
          standardCost: quickAddCost ? Number(quickAddCost) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create material");
      }
      const mat = await res.json();
      toast.success("Material created", {
        description: `${mat.code} · HSN ${mat.hsnCode ?? "—"} · GST ${mat.gstRate}%`,
      });

      // Add the new material as a PO line so it can be received immediately
      const qty = quickAddCost ? Number(quickAddCost) : 0;
      const addLineRes = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLine",
          materialId: mat.id,
          qtyOrdered: 1, // default qty — user can receive partial
          unitCost: quickAddCost ? Number(quickAddCost) : 0,
        }),
      });
      if (addLineRes.ok) {
        toast.success("Added to PO", { description: "Refreshing to show new line…" });
        // Close dialog and refresh the page so the new line appears
        setShowQuickAdd(false);
        setOpen(false);
        router.refresh();
      } else {
        const err = await addLineRes.json().catch(() => ({}));
        toast.error("Material created but couldn't add to PO", {
          description: err.error ?? "Add the line manually in the PO edit page",
        });
      }
      setQuickAddName("");
      setQuickAddCategory("");
      setQuickAddUnit("NOS");
      setQuickAddCost("");
      setShowQuickAdd(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create material");
    } finally {
      setQuickAddLoading(false);
    }
  }

  function resetForm() {
    setReceipts({});
    setLineLots({});
    setLineBatches({});
    setLineInspection({});
    setLineByWeight({});
    setLineWeights({});
    setGatePassNo("");
    setGatePassMode("gatePass");
    setReceivingPhoto(null);
    setReceiptNotes("");
    setPhotos([]);
    setSignature(null);
    setSupervisorSignature(null);
    setGeo(null);
    setDeliveryMode("");
    setVehicleType("");
    setVehicleNumber("");
    setDriverName("");
    setDriverPhone("");
    setTransporterName("");
    setChallanNumber("");
    setInvoiceNumber("");
    setEwayBillNumber("");
    setLrNumber("");
    setPackageCount("");
    setShortageRemarks("");
    setDamageRemarks("");
    shortageEditedRef.current = false;
    setWbTicketNo("");
    setGrossWt("");
    setTareWt("");
    setNetWt("");
    setUnloadingSlipNo("");
    setUnloadingLocation("");
    setUnloadingRemarks("");
    setRejectReason("");
    setRejectPhotos([]);
    setShowRejectConfirm(false);
  }

  function validateProof(): string | null {
    if (photos.length === 0) return "At least 1 photo is required as proof of delivery";
    if (!signature) return "Receiver e-signature is required";
    if (!geo) return "GPS geo-tag is required";
    if (!deliveryMode) return "Delivery mode is required";
    if (needsVehicleFields) {
      if (!vehicleType) return "Vehicle type is required";
      if (!vehicleNumber) return "Vehicle number is required";
    }
    if (isExWorks && needsVehicleFields && !driverName) return "Driver name is required for EX WORKS pickup";
    if (deliveryMode === "THIRD_PARTY" && !lrNumber) return "LR number is required for third-party transport";
    if (isDeliveredSite && !challanNumber) return "Challan number is required (supplier dispatch document)";
    // Kata parchi (weight slip) — mandatory for non-quantifiable (bulk/loose) materials
    if (kataParchiRequired) {
      if (!wbTicketNo.trim()) return "Kata parchi slip no. is required for bulk/loose materials (CFT, BRASS, TON, KG)";
      if (!grossWt || Number(grossWt) <= 0) return "Gross weight is required on the kata parchi for bulk materials";
      if (!tareWt || Number(tareWt) <= 0) return "Tare weight is required on the kata parchi for bulk materials";
      if (!netWt || Number(netWt) <= 0) return "Net weight must be calculated (gross − tare) for bulk materials";
    }
    return null;
  }

  function validateReject(): string | null {
    if (!rejectReason.trim()) return "Rejection reason is required";
    if (rejectPhotos.length === 0) return "At least 1 photo of the rejected goods is required";
    if (!geo) return "GPS geo-tag is required — proves rejection happened at the gate";
    return null;
  }

  // Track whether user has manually edited shortage remarks
  const shortageEditedRef = useRef(false);

  function prepareReceipt() {
    // Auto-fill shortage remarks before validation (so it's visible even if proof is missing)
    // Only auto-fill if user hasn't manually edited the field
    const enteredLines = lines
      .map((l) => ({ line: l, qty: Number(receipts[l.id] ?? 0) }))
      .filter(({ qty }) => qty > 0);
    const shortLines = enteredLines.filter(({ line, qty }) => {
      const remaining = line.qtyOrdered - line.qtyReceived;
      return qty < remaining;
    });
    if (shortLines.length > 0 && !shortageEditedRef.current) {
      const shortDesc = shortLines.map(({ line, qty }) => {
        const remaining = line.qtyOrdered - line.qtyReceived;
        return `${line.materialCode}: ${qty}/${remaining} ${line.unit}`;
      }).join(", ");
      setShortageRemarks(`Short delivery: ${shortDesc}`);
    }

    const proofError = validateProof();
    if (proofError) {
      toast.error(proofError);
      return;
    }

    let hasOverDelivery = false;
    const validLines = lines
      .map((l) => {
        const qty = Number(receipts[l.id] ?? 0);
        if (!(qty > 0)) return null;
        const remaining = l.qtyOrdered - l.qtyReceived;
        if (qty > remaining) {
          toast.error(`${l.materialName}: over-delivery`, {
            description: `${qty} ${l.unit} exceeds remaining ${remaining} ${l.unit}. Reduce qty or edit the PO.`,
          });
          hasOverDelivery = true;
          return null;
        }
        return { line: l, qty };
      })
      .filter(Boolean) as { line: ReceiveLine; qty: number }[];

    if (validLines.length === 0) {
      if (!hasOverDelivery) toast.error("Enter a quantity for at least one line");
      return;
    }

    if (validLines.length === 0) {
      toast.error("Enter a quantity for at least one line");
      return;
    }

    const summary = validLines.map(({ line, qty }) => {
      const remaining = line.qtyOrdered - line.qtyReceived;
      return {
        name: line.materialName,
        qty,
        unit: line.unit,
        cost: qty * line.unitCost,
        weight: lineByWeight[line.id] && lineWeights[line.id] ? `${lineWeights[line.id]} ${line.baseUnit}` : undefined,
        shortage: qty < remaining ? remaining - qty : 0,
        full: qty === remaining,
      };
    });
    haptic(10);
    setConfirmLines(summary);
  }

  async function confirmReceipt() {
    if (!confirmLines) return;
    setSubmitting(true);

    const payloadLines = lines
      .map((l) => {
        const qty = Number(receipts[l.id] ?? 0);
        if (!(qty > 0)) return null;
        return {
          purchaseOrderLineId: l.id,
          materialId: l.materialId,
          qtyReceived: qty,
          unitCost: l.unitCost,
          lotNumber: lineLots[l.id] || undefined,
          batchCode: lineBatches[l.id] || undefined,
          inspectionStatus: lineInspection[l.id] || undefined,
        };
      })
      .filter(Boolean) as {
      purchaseOrderLineId: string;
      materialId: string;
      qtyReceived: number;
      unitCost: number;
      lotNumber?: string;
      batchCode?: string;
      inspectionStatus?: string;
    }[];

    const notesCombined = receiptNotes.trim() || null;

    haptic(30);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesCombined || null,
          lines: payloadLines,
          deliveryTermsType,
          deliveryMode,
          vehicleType: needsVehicleFields ? vehicleType : undefined,
          vehicleNumber: needsVehicleFields ? vehicleNumber : undefined,
          driverName: needsVehicleFields ? driverName : undefined,
          driverPhone: needsVehicleFields ? driverPhone : undefined,
          transporterName: deliveryMode === "THIRD_PARTY" ? transporterName : undefined,
          challanNumber,
          invoiceNumber: invoiceNumber || undefined,
          ewayBillNumber: ewayBillNumber || undefined,
          lrNumber: deliveryMode === "THIRD_PARTY" ? lrNumber : undefined,
          packageCount: packageCount ? Number(packageCount) : undefined,
          photos,
          receiverSignature: signature,
          receiverLat: geo?.lat,
          receiverLng: geo?.lng,
          receiverLocation: geo?.location,
          shortageRemarks: shortageRemarks || undefined,
          damageRemarks: damageRemarks || undefined,
          supervisorSignature: supervisorSignature || undefined,
          weighbridgeTicketNo: wbTicketNo || undefined,
          grossWeight: grossWt ? Number(grossWt) : undefined,
          tareWeight: tareWt ? Number(tareWt) : undefined,
          netWeight: netWt ? Number(netWt) : undefined,
          // Gate pass / receiving + unloading
          gatePassNo: gatePassMode === "gatePass" ? (gatePassNo.trim() || undefined) : undefined,
          receivingPhotoUrl: gatePassMode === "receiving" ? (receivingPhoto?.url || undefined) : undefined,
          unloadingSlipNo: unloadingSlipNo.trim() || undefined,
          unloadedAt: new Date().toISOString(),
          unloadingLocation: unloadingLocation.trim() || undefined,
          unloadingRemarks: unloadingRemarks.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record receipt");
      }
      const data = await res.json();
      toast.success("GRN recorded — stock updated", {
        description: `PO is now ${data.newStatus}`,
      });
      setLastGrnId(data.goodsReceiptId);
      setLastNewStatus(data.newStatus);
      resetForm();
      setConfirmLines(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record receipt");
    } finally {
      setSubmitting(false);
    }
  }

  function prepareReject() {
    const err = validateReject();
    if (err) {
      toast.error(err);
      return;
    }
    haptic(10);
    setShowRejectConfirm(true);
  }

  async function confirmReject() {
    setSubmitting(true);
    haptic(30);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejectionReason: rejectReason.trim(),
          rejectionPhotos: rejectPhotos,
          vehicleNumber,
          challanNumber,
          notes: receiptNotes || undefined,
          // Geo-tag the rejection — proves it happened at the gate
          receiverLat: geo?.lat,
          receiverLng: geo?.lng,
          receiverLocation: geo?.location,
          // Gate pass no. (if supplier's vehicle had one)
          gatePassNo: gatePassMode === "gatePass" ? (gatePassNo.trim() || undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record rejection");
      }
      toast.success("Delivery rejected", {
        description: "Rejection recorded. Create a supplier return if needed.",
      });
      resetForm();
      setShowRejectConfirm(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record rejection");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state: show after GRN is recorded ──
  if (open && lastGrnId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="size-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)" }}>
            <CheckCircle2 className="size-8" style={{ color: "var(--color-go)" }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-ink-950)" }}>GRN Recorded</h2>
          <p className="text-[0.75rem] mt-1 text-center" style={{ color: "var(--color-steel)" }}>
            Stock updated · PO is now <span className="font-semibold">{lastNewStatus}</span>
          </p>

          <div className="w-full mt-6 space-y-2">
            <a
              href={`/print/goods-receipt/${lastGrnId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.75rem] font-bold press transition-colors"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <Printer className="size-4" />
              Print GRN / Delivery Challan
            </a>
            <button
              type="button"
              onClick={() => {
                // Create a draft supplier invoice from the GRN
                fetch("/api/supplier-invoices/from-grn", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ goodsReceiptId: lastGrnId }),
                })
                  .then(async (r) => {
                    if (!r.ok) {
                      const e = await r.json().catch(() => ({}));
                      throw new Error(e.error ?? "Failed to create invoice");
                    }
                    return r.json();
                  })
                  .then((inv) => {
                    toast.success("Draft supplier invoice created", {
                      description: `${inv.invoiceNumber} — review & approve in Finance`,
                    });
                    setLastGrnId(null);
                    setOpen(false);
                    router.push("/finance?tab=invoices");
                  })
                  .catch((e) => {
                    toast.error(e instanceof Error ? e.message : "Failed to create invoice");
                  });
              }}
              className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.6875rem] font-bold border-2 press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)", backgroundColor: "transparent" }}
            >
              <FileText className="size-3.5" />
              Create Supplier Bill (3-way match)
            </button>
            <button
              type="button"
              onClick={() => { setLastGrnId(null); setOpen(false); router.refresh(); }}
              className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.6875rem] font-semibold press"
              style={{ color: "var(--color-steel)" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => { haptic(5); setMode("receive"); setOpen(true); }}
          className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.75rem] font-bold press transition-colors"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          <ScanLine className="size-4" />
          Receive materials
        </button>
        <button
          type="button"
          onClick={() => { haptic(5); setMode("reject"); setOpen(true); }}
          className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border-2 press"
          style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)", backgroundColor: "transparent" }}
        >
          <XCircle className="size-3.5" />
          Reject delivery
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={() => { if (!submitting && !confirmLines && !showRejectConfirm) setOpen(false); }}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center size-7 rounded-[0.375rem] shrink-0" style={{ backgroundColor: mode === "reject" ? "color-mix(in srgb, var(--color-stop) 15%, transparent)" : "var(--color-concrete)" }}>
              {mode === "reject" ? <XCircle className="size-3.5" style={{ color: "var(--color-stop)" }} /> : <Package className="size-3.5" style={{ color: "var(--color-ink-700)" }} />}
            </span>
            <div className="min-w-0">
              <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {mode === "reject" ? "Reject Delivery" : "Receive Materials"}
              </p>
              <p className="text-[0.5625rem] truncate font-mono" style={{ color: "var(--color-ink-500)" }}>{poNumber} · {supplierName}</p>
            </div>
          </div>
          <button onClick={() => { if (!submitting && !confirmLines && !showRejectConfirm) setOpen(false); }} className="press shrink-0 p-1">
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
            <span className="text-[0.5625rem] font-semibold truncate" style={{ color: "var(--color-steel)" }}>{locationName}</span>
          </div>
          {geo && locationLat != null && locationLng != null ? (
            <GeoFenceStatus
              ok={
                // Haversine distance check (client-side preview)
                (() => {
                  const R = 6371000;
                  const dLat = (geo.lat - locationLat) * Math.PI / 180;
                  const dLng = (geo.lng - locationLng) * Math.PI / 180;
                  const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(locationLat * Math.PI / 180) *
                    Math.cos(geo.lat * Math.PI / 180) *
                    Math.sin(dLng / 2) ** 2;
                  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  return dist <= (locationGeoRadius ?? 500);
                })()
              }
            />
          ) : null}
        </div>

        {mode === "reject" ? (
          /* ── REJECT MODE ── */
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-3 space-y-3">
              <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)" }}>
                <p className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-stop)" }}>
                  Goods will be refused entry. No stock will be received. A rejection record will be created for audit + supplier dispute resolution.
                </p>
              </div>
              <TextField label="Vehicle Number" value={vehicleNumber} onChange={setVehicleNumber} placeholder="MH-12-AB-1234" mono />
              <TextField label="Challan Number" value={challanNumber} onChange={setChallanNumber} placeholder="Supplier challan no." mono />
              <div>
                <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Rejection Reason <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Damaged packaging, wrong material, expired stock..."
                  rows={3}
                  className="w-full rounded-[0.5rem] border px-2.5 py-2 text-[0.6875rem] outline-none resize-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
                />
              </div>
              <PhotoCapture photos={rejectPhotos} onChange={setRejectPhotos} mandatory />
              <GeoTagCapture lat={geo?.lat ?? null} lng={geo?.lng ?? null} location={geo?.location ?? null} onChange={setGeo} mandatory />
              <TextField label="Additional Notes" value={receiptNotes} onChange={setReceiptNotes} placeholder="Any extra context" />
            </div>
          </div>
        ) : (
          /* ── RECEIVE MODE ── */
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* Line items with batch/lot + inspection */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
                  Line Items ({lines.length})
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={receiveFull}
                    className="flex items-center gap-1 text-[0.5rem] font-bold press rounded-[0.25rem] px-1.5 py-0.5"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
                  >
                    <CheckCircle2 className="size-2.5" /> Receive Full
                  </button>
                  <button
                    type="button"
                    onClick={() => { haptic(5); setShowQuickAdd(!showQuickAdd); loadCategories(); }}
                    className="flex items-center gap-1 text-[0.5rem] font-bold press"
                    style={{ color: "var(--color-signal-dark)" }}
                  >
                    <Plus className="size-3" /> Quick Add
                  </button>
                </div>
              </div>

              {/* Quick Add Material form */}
              {showQuickAdd ? (
                <div className="rounded-[0.5rem] border p-2.5 space-y-2" style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 4%, transparent)" }}>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="size-3" style={{ color: "var(--color-signal-dark)" }} />
                    <p className="text-[0.5rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
                      New material — code + HSN/GST auto-generated
                    </p>
                  </div>
                  <input type="text" placeholder="Material name" value={quickAddName} onChange={(e) => setQuickAddName(e.target.value)} className="w-full h-8 rounded-[0.375rem] border px-2 text-[0.6875rem] outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={quickAddCategory} onChange={(e) => setQuickAddCategory(e.target.value)} className="h-8 rounded-[0.375rem] border px-2 text-[0.6875rem] outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}>
                      <option value="">Select category…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex gap-1">
                      <input type="text" placeholder="Unit" value={quickAddUnit} onChange={(e) => setQuickAddUnit(e.target.value)} className="w-16 h-8 rounded-[0.375rem] border px-2 text-[0.6875rem] outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
                      <input type="number" inputMode="decimal" placeholder="Cost" value={quickAddCost} onChange={(e) => setQuickAddCost(e.target.value)} className="flex-1 h-8 rounded-[0.375rem] border px-2 text-[0.6875rem] text-right tabular-nums outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowQuickAdd(false)} className="flex-1 h-7 rounded-[0.25rem] text-[0.5625rem] font-bold border" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>Cancel</button>
                    <button type="button" onClick={handleQuickAdd} disabled={quickAddLoading} className="flex-1 h-7 rounded-[0.25rem] text-[0.5625rem] font-bold" style={{ backgroundColor: "var(--color-signal)", color: "#fff" }}>
                      {quickAddLoading ? "Creating…" : "Create + auto-fill HSN/GST"}
                    </button>
                  </div>
                </div>
              ) : null}
              {lines.map((l) => {
                const remaining = l.qtyOrdered - l.qtyReceived;
                const done = remaining <= 0;
                const canConvert = hasWeightConversion(l);
                const byWeight = !!lineByWeight[l.id];
                const currentQty = Number(receipts[l.id] ?? 0);
                const currentWeight = Number(lineWeights[l.id] ?? 0);
                const lineStatus = getLineStatus(l);
                const expWt = expectedWeight(l);
                // Shortage = ordered - received (this delivery) - previously received
                const shortage = currentQty > 0 ? remaining - currentQty : 0;
                return (
                  <div key={l.id} className="rounded-[0.5rem] border p-2.5" style={{ borderColor: lineStatus === "over" ? "var(--color-stop)" : "var(--color-line)", backgroundColor: done ? "var(--color-paper-2)" : "var(--color-paper)", opacity: done ? 0.6 : 1 }}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</p>
                        <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                          {l.materialCode} · {formatNumber(l.qtyReceived, 0)}/{formatNumber(l.qtyOrdered, 0)} {l.unit}
                          {remaining > 0 ? <span style={{ color: "var(--color-signal-dark)" }}> · {formatNumber(remaining, 0)} left</span> : null}
                        </p>
                        {/* HSN/GST + UOM conversion badge */}
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {l.hsnCode ? (
                            <span className="text-[0.4375rem] font-semibold rounded px-1 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}>
                              HSN {l.hsnCode} · GST {l.gstRate}%
                            </span>
                          ) : (
                            <span className="text-[0.4375rem] font-semibold rounded px-1 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 10%, transparent)", color: "var(--color-stop)" }}>
                              ⚠ No HSN/GST
                            </span>
                          )}
                          {canConvert ? (
                            <span className="text-[0.4375rem] font-semibold rounded px-1 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)", color: "var(--color-signal-dark)" }}>
                              1 {l.unit} = {l.uomConversionFactor} {l.baseUnit}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {done ? <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} /> : null}
                    </div>
                    {!done ? (
                      <>
                        {/* Shortage / over-delivery indicator */}
                        {lineStatus !== "none" && lineStatus !== "full" ? (
                          <div className="mb-1 rounded-[0.25rem] px-2 py-0.5 text-[0.5rem] font-semibold" style={{
                            backgroundColor: lineStatus === "over"
                              ? "color-mix(in srgb, var(--color-stop) 10%, transparent)"
                              : "color-mix(in srgb, var(--color-signal) 10%, transparent)",
                            color: lineStatus === "over" ? "var(--color-stop)" : "var(--color-signal-dark)",
                          }}>
                            {lineStatus === "over"
                              ? `⚠ Over: ${formatNumber(currentQty, 0)} > ${formatNumber(remaining, 0)} ${l.unit}`
                              : `Short: ${formatNumber(shortage, 0)} ${l.unit} (${formatNumber(currentQty, 0)}/${formatNumber(remaining, 0)})`}
                          </div>
                        ) : null}

                        {/* Input row: [toggle?] [qty/wt] [lot] [inspect] */}
                        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: canConvert ? "28px 64px 1fr 1fr" : "64px 1fr 1fr" }}>
                          {/* By Weight toggle — compact icon button */}
                          {canConvert ? (
                            <button
                              type="button"
                              onClick={() => { haptic(5); toggleByWeight(l.id); }}
                              className="flex items-center justify-center h-8 rounded-[0.375rem] border press"
                              style={{
                                backgroundColor: byWeight ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-paper-2)",
                                color: byWeight ? "var(--color-signal-dark)" : "var(--color-ink-500)",
                                borderColor: byWeight ? "color-mix(in srgb, var(--color-signal) 30%, transparent)" : "var(--color-line)",
                              }}
                              title={byWeight ? "Switch to count" : "Switch to weight"}
                            >
                              <Scale className="size-3" />
                            </button>
                          ) : null}
                          {/* Qty or Weight input */}
                          <div className="flex items-center rounded-[0.375rem] border overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
                            {byWeight && canConvert ? (
                              <>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.001"
                                  min="0"
                                  placeholder="Wt"
                                  value={lineWeights[l.id] ?? ""}
                                  onChange={(e) => setLineWeight(l.id, e.target.value)}
                                  className="w-full h-8 px-1 text-[0.625rem] text-right tabular-nums outline-none bg-transparent"
                                  style={{ color: "var(--color-ink-950)" }}
                                />
                                <span className="text-[0.4375rem] font-bold shrink-0 px-0.5" style={{ color: "var(--color-ink-500)" }}>{l.baseUnit}</span>
                              </>
                            ) : (
                              <>
                                <input type="number" inputMode="decimal" step="0.001" min="0" max={remaining} placeholder="Qty" value={receipts[l.id] ?? ""} onChange={(e) => setQty(l.id, e.target.value)} className="w-full h-8 px-1 text-[0.625rem] text-right tabular-nums outline-none bg-transparent" style={{ color: "var(--color-ink-950)" }} />
                                <span className="text-[0.4375rem] font-bold shrink-0 px-0.5" style={{ color: "var(--color-ink-500)" }}>{l.unit}</span>
                              </>
                            )}
                          </div>
                          {/* Lot/Batch */}
                          <input type="text" placeholder="Lot/Batch" value={lineLots[l.id] ?? ""} onChange={(e) => setLineLots((s) => ({ ...s, [l.id]: e.target.value }))} className="h-8 rounded-[0.25rem] border px-1.5 text-[0.5625rem] outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
                          {/* Inspection */}
                          <select value={lineInspection[l.id] ?? ""} onChange={(e) => setLineInspection((s) => ({ ...s, [l.id]: e.target.value }))} className="h-8 rounded-[0.25rem] border px-1.5 text-[0.5625rem] font-semibold outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}>
                            <option value="">Inspect…</option>
                            {INSPECTION_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>

                        {/* Secondary row: weight calc / WB button / expected weight */}
                        {byWeight && canConvert ? (
                          <div className="flex items-center gap-1.5 mb-1">
                            {currentWeight > 0 ? (
                              <span className="text-[0.5rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
                                = {formatNumber(currentQty, 3)} {l.unit}
                              </span>
                            ) : null}
                            {netWt ? (
                              <button
                                type="button"
                                onClick={() => { haptic(5); useWeighbridgeForLine(l.id); }}
                                className="ml-auto text-[0.4375rem] font-bold press rounded-[0.25rem] px-1.5 py-0.5"
                                style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                              >
                                WB: {netWt} {l.baseUnit}
                              </button>
                            ) : null}
                          </div>
                        ) : expWt ? (
                          <div className="text-[0.4375rem] text-right mb-1" style={{ color: "var(--color-ink-500)" }}>
                            ≈ {formatNumber(expWt, 1)} {l.baseUnit}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Delivery & transport */}
            <div className="px-3 pb-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>
                Delivery & Transport
                {deliveryTermsType ? <span className="ml-1 normal-case" style={{ color: "var(--color-ink-500)" }}>({deliveryTermsType.replace(/_/g, " ")})</span> : null}
              </p>
              {needsVehicleFields ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <SelectField label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} options={DELIVERY_MODES} required />
                    <SelectField label="Vehicle Type" value={vehicleType} onChange={setVehicleType} options={VEHICLE_TYPES} required />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <TextField label="Vehicle No." value={vehicleNumber} onChange={setVehicleNumber} placeholder="MH-12" required mono />
                    <TextField label="Driver" value={driverName} onChange={setDriverName} placeholder="Name" required={isExWorks} />
                    <TextField label="Phone" value={driverPhone} onChange={setDriverPhone} placeholder="98765" />
                  </div>
                  {deliveryMode === "THIRD_PARTY" ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <TextField label="Transporter" value={transporterName} onChange={setTransporterName} placeholder="ABC Transport" />
                      <TextField label="LR Number" value={lrNumber} onChange={setLrNumber} placeholder="Lorry receipt" required mono />
                    </div>
                  ) : null}
                </>
              ) : (
                <SelectField label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} options={DELIVERY_MODES} required />
              )}
            </div>

            {/* Kata Parchi (weight slip) — always shown.
                Mandatory for non-quantifiable (bulk/loose) materials like CFT, BRASS, TON.
                Optional for quantifiable (countable) materials like BAG, NOS, PIECE. */}
            <div className="px-3 pb-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: "var(--color-steel)" }}>
                <Scale className="size-3" /> Weighbridge (Kata Parchi)
                {kataParchiRequired ? (
                  <span className="text-[0.4375rem] font-bold px-1 py-0.5 rounded-[0.25rem]" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)", color: "var(--color-stop)" }}>
                    MANDATORY
                  </span>
                ) : (
                  <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-400)" }}>
                    (optional)
                  </span>
                )}
              </p>
              <WeighbridgeFields
                ticketNo={wbTicketNo} onTicketNoChange={setWbTicketNo}
                grossWeight={grossWt} onGrossChange={setGrossWt}
                tareWeight={tareWt} onTareChange={setTareWt}
                netWeight={netWt} onNetChange={setNetWt}
                required={kataParchiRequired}
              />
              {hasConvertibleLines ? (
                <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>
                  Tap the scale icon on a line to fill its weight from this weighbridge.
                </p>
              ) : null}
            </div>

            {/* Documents */}
            <div className="px-3 pb-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>Documents</p>

              {/* Gate Pass No. / Receiving — toggle between the two modes */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <button
                    type="button"
                    onClick={() => { haptic(5); setGatePassMode("gatePass"); }}
                    className="flex-1 text-[0.5rem] font-bold py-1 rounded-[0.25rem] press"
                    style={{
                      backgroundColor: gatePassMode === "gatePass" ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-paper-2)",
                      color: gatePassMode === "gatePass" ? "var(--color-signal-dark)" : "var(--color-ink-500)",
                      border: `1px solid ${gatePassMode === "gatePass" ? "color-mix(in srgb, var(--color-signal) 30%, transparent)" : "var(--color-line)"}`,
                    }}
                  >
                    Gate Pass No.
                  </button>
                  <button
                    type="button"
                    onClick={() => { haptic(5); setGatePassMode("receiving"); }}
                    className="flex-1 text-[0.5rem] font-bold py-1 rounded-[0.25rem] press"
                    style={{
                      backgroundColor: gatePassMode === "receiving" ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-paper-2)",
                      color: gatePassMode === "receiving" ? "var(--color-signal-dark)" : "var(--color-ink-500)",
                      border: `1px solid ${gatePassMode === "receiving" ? "color-mix(in srgb, var(--color-signal) 30%, transparent)" : "var(--color-line)"}`,
                    }}
                  >
                    Receiving (no pass)
                  </button>
                </div>
                {gatePassMode === "gatePass" ? (
                  <input
                    type="text"
                    value={gatePassNo}
                    onChange={(e) => setGatePassNo(e.target.value)}
                    placeholder="Supplier gate pass no."
                    className="w-full h-8 rounded-[0.25rem] border px-1.5 text-[0.5625rem] font-mono outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
                  />
                ) : (
                  <ReceivingPhotoUpload photo={receivingPhoto} onChange={setReceivingPhoto} />
                )}
              </div>

              {/* Unloading slip + challan + package */}
              <div className="grid grid-cols-3 gap-1.5">
                <TextField label="Unload Slip" value={unloadingSlipNo} onChange={setUnloadingSlipNo} placeholder="US-001" mono />
                <TextField label="Challan" value={challanNumber} onChange={setChallanNumber} placeholder="Dispatch no." required={isDeliveredSite} mono />
                <TextField label="Package" value={packageCount} onChange={setPackageCount} placeholder="0" />
              </div>
              {/* Unloading details — where goods were unloaded + any damage during unloading */}
              <div className="grid grid-cols-2 gap-1.5">
                <TextField label="Unload At" value={unloadingLocation} onChange={setUnloadingLocation} placeholder="Bay / yard / shed" />
                <TextField label="Unload Notes" value={unloadingRemarks} onChange={setUnloadingRemarks} placeholder="Stacking / damage" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <TextField label="Invoice No." value={invoiceNumber} onChange={setInvoiceNumber} placeholder="If with goods" mono />
                <TextField label="E-Way Bill" value={ewayBillNumber} onChange={setEwayBillNumber} placeholder="GST e-way" mono />
              </div>
            </div>

            {/* Proof of delivery — mandatory */}
            <div className="px-3 pb-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-stop)" }}>
                Proof of Delivery (Mandatory)
              </p>
              {/* Photos + Signature side-by-side */}
              <div className="grid grid-cols-2 gap-2 items-stretch">
                <PhotoCapture photos={photos} onChange={setPhotos} mandatory compact />
                <SignaturePad value={signature} onChange={setSignature} mandatory compact />
              </div>
              <GeoTagCapture lat={geo?.lat ?? null} lng={geo?.lng ?? null} location={geo?.location ?? null} onChange={setGeo} mandatory />
            </div>

            {/* Supervisor co-signature (optional) */}
            <div className="px-3 pb-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
                Supervisor Co-sign (optional)
              </p>
              <SignaturePad value={supervisorSignature} onChange={setSupervisorSignature} compact />
            </div>

            {/* Remarks */}
            <div className="px-3 pb-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-steel)" }}>Remarks</p>
              <TextField label="Receipt Remarks" value={receiptNotes} onChange={setReceiptNotes} placeholder="Vehicle / challan details" />
              <div className="grid grid-cols-2 gap-1.5">
                <TextField label="Shortage" value={shortageRemarks} onChange={(v) => { shortageEditedRef.current = true; setShortageRemarks(v); }} placeholder="If any shortage" />
                <TextField label="Damage" value={damageRemarks} onChange={setDamageRemarks} placeholder="If any damage" />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
          {mode === "reject" ? (
            <button type="button" onClick={prepareReject} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
              {submitting ? (<><div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Recording…</>) : (<><XCircle className="size-4" />Review rejection</>)}
            </button>
          ) : (
            <button type="button" onClick={prepareReceipt} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              <CheckCircle2 className="size-4" />
              Review receipt
            </button>
          )}
        </div>

        {/* ── Confirmation overlay (receive mode only) ── */}
        {mode === "receive" && confirmLines ? (
          <div className="absolute inset-0 z-10 flex flex-col justify-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => { if (!submitting) setConfirmLines(null); }}>
            <div className="rounded-t-[0.75rem] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
                <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Confirm Receipt</p>
                <button onClick={() => { if (!submitting) setConfirmLines(null); }} className="press p-1"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
              </div>
              <div className="max-h-[35vh] overflow-y-auto p-3 space-y-2">
                {confirmLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {l.name}
                        {l.full ? <span className="ml-1 text-[0.4375rem]" style={{ color: "var(--color-go)" }}>✓ full</span> : null}
                      </p>
                      <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                        {l.weight ? <span style={{ color: "var(--color-signal-dark)" }}>{l.weight} → </span> : null}
                        {formatNumber(l.qty, 3)} {l.unit} @ {formatCurrency(l.cost / l.qty)}
                      </p>
                      {l.shortage > 0 ? (
                        <p className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
                          {l.shortage} {l.unit} short
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[0.6875rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(l.cost)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2.5 mt-1" style={{ borderColor: "var(--color-line)" }}>
                  <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Total value</span>
                  <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>{formatCurrency(confirmLines.reduce((s, l) => s + l.cost, 0))}</span>
                </div>
              </div>
              <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
                <button type="button" onClick={confirmReceipt} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-go)", color: "#fff" }}>
                  {submitting ? (<><div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Recording…</>) : (<><CheckCircle2 className="size-4" />Confirm — update stock</>)}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Rejection confirmation overlay ── */}
        {mode === "reject" && showRejectConfirm ? (
          <div className="absolute inset-0 z-10 flex flex-col justify-end" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => { if (!submitting) setShowRejectConfirm(false); }}>
            <div className="rounded-t-[0.75rem] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
                <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-stop)" }}>Confirm Rejection</p>
                <button onClick={() => { if (!submitting) setShowRejectConfirm(false); }} className="press p-1"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
              </div>
              <div className="p-3 space-y-2">
                <div className="rounded-[0.375rem] p-2" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)" }}>
                  <p className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-stop)" }}>
                    Goods will be refused entry. No stock will be received.
                  </p>
                  <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                    A rejection record with photos + GPS will be created for audit + supplier dispute resolution.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Reason</p>
                  <p className="text-[0.625rem]" style={{ color: "var(--color-ink-950)" }}>{rejectReason}</p>
                </div>
                <div className="flex gap-3 text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                  <span>📷 {rejectPhotos.length} photo(s)</span>
                  {geo && <span>📍 GPS captured</span>}
                  {vehicleNumber && <span>🚚 {vehicleNumber}</span>}
                </div>
              </div>
              <div className="border-t p-3" style={{ borderColor: "var(--color-line)" }}>
                <button type="button" onClick={confirmReject} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-[0.5rem] py-3 text-[0.75rem] font-bold press" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
                  {submitting ? (<><div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Recording…</>) : (<><XCircle className="size-4" />Confirm — reject delivery</>)}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
