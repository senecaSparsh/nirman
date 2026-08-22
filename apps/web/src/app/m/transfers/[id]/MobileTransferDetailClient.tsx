"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowLeftRight, MapPin, Calendar, FileText,
  CheckCircle2, AlertTriangle, Clock, Package, Loader2, XCircle,
  Building2, Truck, User, RotateCcw, Printer, LogIn, Info,
  Phone, Hash, Boxes, ClipboardList, Weight, Navigation, ShieldCheck,
} from "lucide-react";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { formatDate, formatNumber, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import {
  MobileTransferDispatchDialog, MobileTransferReceiveDialog,
} from "./MobileTransferReceiveDialog";

type TransferStatus = "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

interface TransferLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  qty: number;
  qtyReceived: number;
  unitCostAtSource: number | null;
  unitTransferPrice: number | null;
  lineTransferTotal: number | null;
  hsnCode: string | null;
  gstRate: number;
}

interface TransferData {
  id: string;
  status: TransferStatus;
  transferDate: string;
  createdAt: string;
  notes: string | null;
  isInterCompany: boolean;
  freight: number;
  handlingFee: number;
  markupPct: number;
  transferPriceTotal: number | null;
  fromLocation: { id: string; name: string; type: string; address: string | null; companyName: string | null };
  toLocation: { id: string; name: string; type: string; address: string | null; companyName: string | null; lat: number | null; lng: number | null; geoRadius: number | null };
  createdByName: string | null;
  // Dispatch info
  dispatchedAt: string | null;
  dispatchedByName: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;
  challanNumber: string | null;
  packageCount: number | null;
  dispatchPhotos: { url: string; fileName?: string }[] | null;
  dispatchSignature: string | null;
  // Receive info
  receivedAt: string | null;
  receivedByName: string | null;
  receiverSignature: string | null;
  receiverLat: number | null;
  receiverLng: number | null;
  receiverLocation: string | null;
  photos: { url: string; fileName?: string }[] | null;
  deliveryMode: string | null;
  shortageRemarks: string | null;
  damageRemarks: string | null;
  supervisorSignature: string | null;
  weighbridgeTicketNo: string | null;
  grossWeight: number | null;
  tareWeight: number | null;
  netWeight: number | null;
  geoFenceOk: boolean | null;
  geoFenceDistance: number | null;
  totalQty: number;
  lineCount: number;
  // Sender/receiver context
  currentCompanyId: string;
  fromCompanyId: string;
  toCompanyId: string;
  isSourceCompany: boolean;
  isDestCompany: boolean;
  userMemberships: { id: string; name: string; role: string }[];
  gatePass: { id: string; gatePassNumber: string; status: string } | null;
  lines: TransferLine[];
}

/**
 * Stock transfer detail — shows from → to header, status, line items,
 * dispatch/receive timeline, and action buttons.
 *
 * State machine: DRAFT → IN_TRANSIT (dispatch) → COMPLETED (receive with proof) | CANCELLED
 */
export function MobileTransferDetailClient({
  transfer,
  canManage,
}: {
  transfer: TransferData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<"cancel" | "return" | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const isDraft = transfer.status === "DRAFT";
  const isInTransit = transfer.status === "IN_TRANSIT";
  const isCompleted = transfer.status === "COMPLETED";
  const isCancelled = transfer.status === "CANCELLED";

  // Sender/receiver context
  const isSourceCompany = transfer.isSourceCompany;
  const isDestCompany = transfer.isDestCompany;
  const isInterCompany = transfer.isInterCompany;
  // Can dispatch: user is from the source company
  const canDispatch = canManage && isSourceCompany && isDraft;
  // Can receive: user is from the destination company
  const canReceive = canManage && isDestCompany && isInTransit;
  // Can cancel: user is from the source company (only source can cancel their outgoing draft)
  const canCancel = canManage && isSourceCompany && isDraft;
  // Can return to source: user is from the destination company (they are the ones who reject)
  const canReturn = canManage && isDestCompany && isInTransit;

  // For inter-company: find the destination company in user's memberships
  const destCompanyMembership = transfer.userMemberships.find((m) => m.id === transfer.toCompanyId);
  const sourceCompanyMembership = transfer.userMemberships.find((m) => m.id === transfer.fromCompanyId);

  async function switchCompany(companyId: string) {
    haptic(10);
    try {
      await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      window.dispatchEvent(new CustomEvent("nirman-company-switched"));
      router.refresh();
    } catch {
      toast.error("Failed to switch company");
    }
  }

  const StatusIcon = isDraft ? Clock : isInTransit ? Truck : isCompleted ? CheckCircle2 : AlertTriangle;
  const accentColor = isDraft
    ? "var(--color-signal)"
    : isInTransit
      ? "var(--color-signal-dark)"
      : isCompleted
        ? "var(--color-go)"
        : "var(--color-stop)";
  const statusLabel = isDraft
    ? "Draft"
    : isInTransit
      ? "In Transit"
      : isCompleted
        ? "Completed"
        : "Cancelled";

  const handleCancel = async () => {
    haptic(10);
    setActing("cancel");
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to cancel");
      }
      toast.success("Transfer cancelled");
      router.refresh();
    } catch (err) {
      haptic([10, 30, 10]);
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setActing(null);
      setShowCancel(false);
    }
  };

  const handleReturnToSource = async () => {
    if (!returnReason.trim()) {
      toast.error("Please enter a reason for returning to source");
      return;
    }
    haptic(10);
    setActing("return");
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "returnToSource", reason: returnReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to return to source");
      }
      toast.success("Transfer returned to source", { description: returnReason.trim() });
      router.refresh();
    } catch (err) {
      haptic([10, 30, 10]);
      toast.error(err instanceof Error ? err.message : "Failed to return to source");
    } finally {
      setActing(null);
      setShowReturn(false);
      setReturnReason("");
    }
  };

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Stock Transfer
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
        >
          <StatusIcon className="size-2.5" />
          {statusLabel}
        </span>
        <a
          href={`/print/stock-transfer/${transfer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center size-7 rounded-full shrink-0 press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
          onClick={() => haptic(5)}
        >
          <Printer className="size-3.5" />
        </a>
      </div>

      {/* ── From → To banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>From</p>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{transfer.fromLocation.name}</p>
            <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>{transfer.fromLocation.type.replace(/_/g, " ").toLowerCase()}</p>
            {transfer.isInterCompany && transfer.fromLocation.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>{transfer.fromLocation.companyName}</p>
            ) : null}
            {transfer.fromLocation.address ? (
              <p className="text-[0.4375rem] truncate mt-0.5" style={{ color: "var(--color-ink-400)" }}>{transfer.fromLocation.address}</p>
            ) : null}
          </div>
          <div className="grid place-items-center size-7 rounded-full shrink-0" style={{ backgroundColor: "var(--color-concrete)" }}>
            <ArrowRight className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>To</p>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{transfer.toLocation.name}</p>
            <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>{transfer.toLocation.type.replace(/_/g, " ").toLowerCase()}</p>
            {transfer.isInterCompany && transfer.toLocation.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>{transfer.toLocation.companyName}</p>
            ) : null}
            {transfer.toLocation.address ? (
              <p className="text-[0.4375rem] truncate mt-0.5" style={{ color: "var(--color-ink-400)" }}>{transfer.toLocation.address}</p>
            ) : null}
          </div>
        </div>
        {transfer.isInterCompany ? (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            <Building2 className="size-3" style={{ color: "var(--color-signal-dark)" }} />
            <span className="text-[0.5rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>Inter-company STO</span>
            {transfer.markupPct > 0 ? (
              <span className="text-[0.5rem] ml-auto" style={{ color: "var(--color-ink-500)" }}>Markup: {transfer.markupPct}%</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Summary row ── */}
      <div className="rounded-[0.625rem] border p-3 mb-3 flex items-center justify-between" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div>
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Items</p>
          <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{transfer.lineCount}</p>
        </div>
        <div className="text-center">
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Total Qty</p>
          <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatNumber(transfer.totalQty, 2)}</p>
        </div>
        <div className="text-right">
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Status</p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <MobileStatusBadge status={transfer.status} label={statusLabel} />
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="flex flex-col gap-1.5 mb-3">
        <InfoRow icon={Calendar} label="Date" value={formatDate(transfer.transferDate)} />
        {transfer.createdByName ? <InfoRow icon={User} label="Created by" value={transfer.createdByName} /> : null}
        {transfer.notes ? <InfoRow icon={FileText} label="Notes" value={transfer.notes} /> : null}
      </div>

      {/* ── Inter-company pricing ── */}
      {transfer.isInterCompany && (transfer.freight > 0 || transfer.handlingFee > 0 || transfer.markupPct > 0 || transfer.transferPriceTotal != null) ? (
        <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Building2 className="size-3" style={{ color: "var(--color-signal-dark)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-signal-dark)" }}>Transfer Pricing</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
          </div>
          <div className="space-y-1">
            {transfer.freight > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>Freight</span>
                <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(transfer.freight)}</span>
              </div>
            ) : null}
            {transfer.handlingFee > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>Handling</span>
                <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(transfer.handlingFee)}</span>
              </div>
            ) : null}
            {transfer.markupPct > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>Markup</span>
                <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{transfer.markupPct}%</span>
              </div>
            ) : null}
            {transfer.transferPriceTotal != null ? (
              <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>Transfer Price Total</span>
                <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-signal-dark)" }}>{formatCurrency(transfer.transferPriceTotal)}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Transport details ── */}
      <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Truck className="size-3" style={{ color: "var(--color-steel)" }} />
          <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Transport Details</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <TransportField icon={ClipboardList} label="Mode" value={transfer.deliveryMode ? transfer.deliveryMode.replace(/_/g, " ").toLowerCase() : "Not specified"} muted={!transfer.deliveryMode} />
          <TransportField icon={Truck} label="Vehicle type" value={transfer.vehicleType ? transfer.vehicleType.replace(/_/g, " ").toLowerCase() : "Not specified"} muted={!transfer.vehicleType} />
          <TransportField icon={Hash} label="Vehicle no" value={transfer.vehicleNumber ?? "Not specified"} mono={!!transfer.vehicleNumber} muted={!transfer.vehicleNumber} />
          <TransportField icon={FileText} label="Challan no" value={transfer.challanNumber ?? "Not specified"} mono={!!transfer.challanNumber} muted={!transfer.challanNumber} />
          <TransportField icon={Building2} label="Transporter" value={transfer.transporterName ?? "Not specified"} muted={!transfer.transporterName} />
          <TransportField icon={Boxes} label="Packages" value={transfer.packageCount != null ? String(transfer.packageCount) : "Not specified"} muted={transfer.packageCount == null} />
          <TransportField icon={User} label="Driver" value={transfer.driverName ?? "Not specified"} muted={!transfer.driverName} />
          <TransportField icon={Phone} label="Driver phone" value={transfer.driverPhone ?? "Not specified"} mono={!!transfer.driverPhone} muted={!transfer.driverPhone} />
        </div>
      </div>

      {/* ── Weighbridge details ── */}
      <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Weight className="size-3" style={{ color: "var(--color-steel)" }} />
          <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Weighbridge</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <TransportField icon={Hash} label="Ticket no" value={transfer.weighbridgeTicketNo ?? "Not specified"} mono={!!transfer.weighbridgeTicketNo} muted={!transfer.weighbridgeTicketNo} />
          <TransportField icon={Weight} label="Gross wt" value={transfer.grossWeight != null ? `${formatNumber(transfer.grossWeight, 3)} kg` : "Not specified"} muted={transfer.grossWeight == null} />
          <TransportField icon={Weight} label="Tare wt" value={transfer.tareWeight != null ? `${formatNumber(transfer.tareWeight, 3)} kg` : "Not specified"} muted={transfer.tareWeight == null} />
          <TransportField icon={Weight} label="Net wt" value={transfer.netWeight != null ? `${formatNumber(transfer.netWeight, 3)} kg` : "Not specified"} muted={transfer.netWeight == null} />
        </div>
      </div>

      {/* ── Geo-fence verification ── */}
      <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: transfer.geoFenceOk === false ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))" : transfer.geoFenceOk === true ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))" : "var(--color-line)", backgroundColor: transfer.geoFenceOk === false ? "color-mix(in srgb, var(--color-stop) 4%, var(--color-paper))" : transfer.geoFenceOk === true ? "color-mix(in srgb, var(--color-go) 4%, var(--color-paper))" : "var(--color-paper)" }}>
        <div className="flex items-center gap-1.5 mb-2">
          {transfer.geoFenceOk === true ? <ShieldCheck className="size-3" style={{ color: "var(--color-go)" }} /> : transfer.geoFenceOk === false ? <AlertTriangle className="size-3" style={{ color: "var(--color-stop)" }} /> : <Navigation className="size-3" style={{ color: "var(--color-steel)" }} />}
          <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: transfer.geoFenceOk === true ? "var(--color-go)" : transfer.geoFenceOk === false ? "var(--color-stop)" : "var(--color-steel)" }}>Geo-fence Verification</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <TransportField icon={ShieldCheck} label="Status" value={transfer.geoFenceOk === true ? "Within boundary" : transfer.geoFenceOk === false ? "Outside boundary" : "Not checked"} muted={transfer.geoFenceOk == null} />
          <TransportField icon={MapPin} label="Distance" value={transfer.geoFenceDistance != null ? `${formatNumber(transfer.geoFenceDistance, 0)}m from center` : "Not specified"} muted={transfer.geoFenceDistance == null} />
          <TransportField icon={Navigation} label="GPS" value={transfer.receiverLat != null && transfer.receiverLng != null ? `${transfer.receiverLat.toFixed(4)}, ${transfer.receiverLng.toFixed(4)}` : "Not captured"} mono={transfer.receiverLat != null} muted={transfer.receiverLat == null} />
          <TransportField icon={MapPin} label="Location" value={transfer.receiverLocation ?? "Not specified"} muted={!transfer.receiverLocation} />
        </div>
      </div>

      {/* ── Dispatch/Receive timeline ── */}
      {(transfer.dispatchedAt || transfer.receivedAt) ? (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Tracking</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
          </div>
          <div className="rounded-[0.625rem] border p-3 space-y-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            {/* Dispatch step */}
            <TimelineStep
              icon={Truck}
              title="Dispatched"
              timestamp={transfer.dispatchedAt}
              userName={transfer.dispatchedByName}
              color="var(--color-signal-dark)"
              photos={transfer.dispatchPhotos}
              signature={transfer.dispatchSignature}
            />
            {/* Receive step */}
            <TimelineStep
              icon={CheckCircle2}
              title="Received"
              timestamp={transfer.receivedAt}
              userName={transfer.receivedByName}
              color="var(--color-go)"
              details={([
                transfer.shortageRemarks ? `Shortage: ${transfer.shortageRemarks}` : null,
                transfer.damageRemarks ? `Damage: ${transfer.damageRemarks}` : null,
              ].filter(Boolean) as string[])}
              photos={transfer.photos}
              signature={transfer.receiverSignature}
              extraSignature={transfer.supervisorSignature}
            />
          </div>
        </div>
      ) : null}

      {/* ── Line items ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowLeftRight className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>Transfer Items</span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      {transfer.lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
          <Package className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>No items in this transfer</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {transfer.lines.map((l, idx) => {
            const hasPartialReceipt = isCompleted && l.qtyReceived > 0 && l.qtyReceived < l.qty;
            const hasShortage = isCompleted && l.qtyReceived < l.qty;
            const lineValue = l.unitCostAtSource != null ? l.qty * l.unitCostAtSource : null;
            return (
              <Link key={l.id} href={`/m/materials/${l.materialId}`} className="block rounded-[0.5rem] border p-2.5 active:opacity-80 transition-opacity" style={{ borderColor: hasShortage ? "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))" : "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                {/* Row 1: Sr + material name + code */}
                <div className="flex items-start gap-2">
                  <span className="text-[0.5rem] font-bold tabular-nums shrink-0 mt-0.5" style={{ color: "var(--color-ink-400)" }}>{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</p>
                    <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>{l.materialCode}{l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}</p>
                  </div>
                </div>
                {/* Row 2: qty sent / qty received / unit */}
                <div className="flex items-center gap-3 mt-1.5 pl-5">
                  <div>
                    <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>Sent</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatNumber(l.qty, 2)} <span className="text-[0.5rem] font-normal" style={{ color: "var(--color-ink-500)" }}>{l.materialUnit}</span></p>
                  </div>
                  {isCompleted && l.qtyReceived !== l.qty ? (
                    <div>
                      <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: hasPartialReceipt ? "var(--color-stop)" : "var(--color-ink-400)" }}>Received</p>
                      <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: hasPartialReceipt ? "var(--color-stop)" : "var(--color-ink-950)" }}>{formatNumber(l.qtyReceived, 2)} <span className="text-[0.5rem] font-normal" style={{ color: "var(--color-ink-500)" }}>{l.materialUnit}</span></p>
                    </div>
                  ) : null}
                  {hasShortage ? (
                    <div className="ml-auto">
                      <span className="text-[0.5rem] font-bold px-1.5 py-0.5 rounded-full" style={{ color: "var(--color-stop)", backgroundColor: "color-mix(in srgb, var(--color-stop) 10%, transparent)" }}>
                        Shortage {formatNumber(l.qty - l.qtyReceived, 2)}
                      </span>
                    </div>
                  ) : null}
                </div>
                {/* Row 3: costs (only if any cost data exists) */}
                {l.unitCostAtSource != null || l.unitTransferPrice != null ? (
                  <div className="flex items-center gap-3 mt-1.5 pl-5 pt-1.5 border-t" style={{ borderColor: "var(--color-line)" }}>
                    {l.unitCostAtSource != null ? (
                      <div>
                        <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>Unit cost</p>
                        <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>{formatCurrency(l.unitCostAtSource)}</p>
                      </div>
                    ) : null}
                    {l.unitTransferPrice != null ? (
                      <div>
                        <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>Transfer price</p>
                        <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-signal-dark)" }}>{formatCurrency(l.unitTransferPrice)}</p>
                      </div>
                    ) : null}
                    {lineValue != null ? (
                      <div className="ml-auto text-right">
                        <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>Line value</p>
                        <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(lineValue)}</p>
                      </div>
                    ) : null}
                    {l.lineTransferTotal != null ? (
                      <div className="ml-auto text-right">
                        <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>Transfer total</p>
                        <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-signal-dark)" }}>{formatCurrency(l.lineTransferTotal)}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Total value summary ── */}
      {transfer.lines.length > 0 ? (() => {
        const totalSourceValue = transfer.lines.reduce((s, l) => s + (l.unitCostAtSource != null ? l.qty * l.unitCostAtSource : 0), 0);
        const totalTransferValue = transfer.lines.reduce((s, l) => s + (l.lineTransferTotal ?? 0), 0);
        const hasAnyCost = transfer.lines.some((l) => l.unitCostAtSource != null || l.lineTransferTotal != null);
        if (!hasAnyCost) return null;
        return (
          <div className="rounded-[0.5rem] border p-3 mt-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
            <div className="space-y-1">
              {totalSourceValue > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>Total source value</span>
                  <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(totalSourceValue)}</span>
                </div>
              ) : null}
              {totalTransferValue > 0 && totalTransferValue !== totalSourceValue ? (
                <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                  <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>Total transfer price</span>
                  <span className="text-[0.75rem] font-bold tabular-nums" style={{ color: "var(--color-signal-dark)" }}>{formatCurrency(totalTransferValue)}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      {/* ── Completed info ── */}
      {isCompleted ? (
        <div className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 mt-4" style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}>
          <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>Stock has been moved from source to destination. Stock ledger and MAC updated.</span>
        </div>
      ) : null}

      {/* ── Cancelled info ── */}
      {isCancelled ? (
        <div className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 mt-4" style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))" }}>
          <XCircle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>This transfer was cancelled. No stock was moved.</span>
        </div>
      ) : null}

      {/* ── Sender/receiver context banner ── */}
      {canManage && (isDraft || isInTransit) && isInterCompany ? (
        <div className="rounded-[0.5rem] border px-3 py-2 mb-3 flex items-center gap-2" style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))" }}>
          <Info className="size-3.5 shrink-0" style={{ color: "var(--color-signal-dark)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
            {isSourceCompany && isDraft ? "You are the sender. Dispatch this transfer when ready." :
             isDestCompany && isInTransit ? "You are the receiver. Confirm receipt when goods arrive." :
             isSourceCompany && isInTransit ? "Waiting for receiver to confirm receipt." :
             isDestCompany && isDraft ? "Waiting for sender to dispatch." :
             "Viewing transfer from another company."}
          </span>
        </div>
      ) : null}

      {/* ── Inter-company switch prompt ── */}
      {canManage && isInterCompany && !isCompleted && !isCancelled ? (
        (() => {
          // User is on source company but needs to be on dest company to receive
          const needsSwitchToDest = isSourceCompany && !isDestCompany && isInTransit && destCompanyMembership;
          // User is on dest company but needs to be on source company to dispatch
          const needsSwitchToSource = isDestCompany && !isSourceCompany && isDraft && sourceCompanyMembership;
          if (!needsSwitchToDest && !needsSwitchToSource) return null;
          const targetCompany = needsSwitchToDest ? destCompanyMembership! : sourceCompanyMembership!;
          const targetLabel = needsSwitchToDest ? "Receive" : "Dispatch";
          return (
            <div className="rounded-[0.5rem] border-2 px-3 py-2.5 mb-3 flex items-center gap-2" style={{ borderColor: "var(--color-signal)", backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, var(--color-paper))" }}>
              <LogIn className="size-4 shrink-0" style={{ color: "var(--color-signal-dark)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Switch to {targetCompany.name} to {targetLabel}
                </p>
                <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
                  You are logged into {transfer.isSourceCompany ? transfer.fromLocation.companyName : transfer.toLocation.companyName}. The {targetLabel.toLowerCase()} must be done from {targetCompany.name}.
                </p>
              </div>
              <button
                onClick={() => switchCompany(targetCompany.id)}
                className="shrink-0 rounded-[0.375rem] px-2.5 py-1.5 text-[0.5625rem] font-bold press"
                style={{ backgroundColor: "var(--color-signal)", color: "#fff" }}
              >
                Switch
              </button>
            </div>
          );
        })()
      ) : null}

      {/* ── Gate pass status banner (for DRAFT transfers awaiting gate pass approval) ── */}
      {canDispatch && transfer.gatePass ? (
        <div className="rounded-[0.5rem] border px-3 py-2 mb-3 flex items-center gap-2" style={{
          borderColor: transfer.gatePass.status === "APPROVED" || transfer.gatePass.status === "EXITED"
            ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))"
            : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
          backgroundColor: transfer.gatePass.status === "APPROVED" || transfer.gatePass.status === "EXITED"
            ? "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))"
            : "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))",
        }}>
          <ShieldCheck className="size-3.5 shrink-0" style={{
            color: transfer.gatePass.status === "APPROVED" || transfer.gatePass.status === "EXITED"
              ? "var(--color-go)" : "var(--color-signal-dark)",
          }} />
          <span className="text-[0.5625rem] flex-1" style={{ color: "var(--color-ink-700)" }}>
            Gate pass <span className="font-mono font-semibold">{transfer.gatePass.gatePassNumber}</span> —{" "}
            {transfer.gatePass.status === "PENDING" ? "awaiting approval. Dispatch blocked until approved." :
             transfer.gatePass.status === "APPROVED" ? "approved — ready to dispatch." :
             transfer.gatePass.status === "EXITED" ? "items have exited." :
             transfer.gatePass.status === "REJECTED" ? "rejected — resubmit or cancel the gate pass." :
             `${transfer.gatePass.status}`}
          </span>
          <a href="/m/gate-pass" className="text-[0.5625rem] font-semibold shrink-0" style={{ color: "var(--color-brand)" }}>
            View →
          </a>
        </div>
      ) : null}

      {/* ── Sticky action bar — context-aware ── */}
      {canManage && (isDraft || isInTransit) ? (
        <div className="sticky bottom-0 z-20 border-t mt-4" style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)", borderColor: "var(--color-line)", backdropFilter: "blur(8px)" }}>
          <div className="mx-auto w-full max-w-[34rem] px-3.5 py-2.5 pb-safe flex items-center gap-2">
            {isDraft ? (
              canDispatch ? (
                <>
                  <button onClick={() => setShowCancel(true)} disabled={acting !== null} className="flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50 px-4" style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)", backgroundColor: "transparent" }}>
                    {acting === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                    Cancel
                  </button>
                  <MobileTransferDispatchDialog
                    transferId={transfer.id}
                    fromLocationName={transfer.fromLocation.name}
                    toLocationName={transfer.toLocation.name}
                    lines={transfer.lines.map((l) => ({ id: l.id, materialId: l.materialId, materialName: l.materialName, materialCode: l.materialCode, materialUnit: l.materialUnit, qty: l.qty, hsnCode: l.hsnCode, gstRate: l.gstRate }))}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] text-[0.6875rem] font-semibold" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}>
                  <Clock className="size-3.5" />
                  Waiting for {transfer.fromLocation.companyName ?? "source company"} to dispatch
                </div>
              )
            ) : isInTransit ? (
              canReceive ? (
                <>
                  <button
                    onClick={() => { haptic(10); setShowReturn(true); }}
                    disabled={acting !== null}
                    className="flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50 px-3"
                    style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)", backgroundColor: "transparent" }}
                  >
                    {acting === "return" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Return
                  </button>
                  <MobileTransferReceiveDialog
                    transferId={transfer.id}
                    fromLocationName={transfer.fromLocation.name}
                    toLocationName={transfer.toLocation.name}
                    locationLat={transfer.toLocation.lat}
                    locationLng={transfer.toLocation.lng}
                    locationGeoRadius={transfer.toLocation.geoRadius}
                    lines={transfer.lines.map((l) => ({ id: l.id, materialId: l.materialId, materialName: l.materialName, materialCode: l.materialCode, materialUnit: l.materialUnit, qty: l.qty, hsnCode: l.hsnCode, gstRate: l.gstRate }))}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] text-[0.6875rem] font-semibold" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}>
                  <Truck className="size-3.5" />
                  In transit — waiting for {transfer.toLocation.companyName ?? "destination"} to receive
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Cancel confirmation modal ── */}
      {showCancel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-md rounded-t-[0.75rem] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Cancel this transfer?</p>
            </div>
            <div className="p-3">
              <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will cancel the stock transfer from {transfer.fromLocation.name} to {transfer.toLocation.name}. No stock will be moved. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowCancel(false)} disabled={acting !== null} className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>Keep</button>
                <button onClick={() => void handleCancel()} disabled={acting !== null} className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
                  {acting === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <><XCircle className="size-3.5" /><span>Cancel Transfer</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Return to source confirmation modal ── */}
      {showReturn ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => { if (acting !== "return") setShowReturn(false); }}>
          <div className="w-full max-w-md rounded-t-[0.75rem] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Return to source?</p>
              <button onClick={() => setShowReturn(false)} className="press shrink-0 p-1 ml-auto">
                <XCircle className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
                Return this transfer to {transfer.fromLocation.name}? Use this when goods are damaged or wrong. A reason is required.
              </p>
              <div>
                <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--color-ink-500)" }}>
                  Reason <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Goods damaged in transit"
                  rows={3}
                  className="w-full rounded-[0.5rem] border px-2.5 py-2 text-[0.6875rem] outline-none resize-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowReturn(false)} disabled={acting !== null} className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>Keep</button>
                <button onClick={() => void handleReturnToSource()} disabled={acting !== null} className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
                  {acting === "return" ? <Loader2 className="size-4 animate-spin" /> : <><RotateCcw className="size-3.5" /><span>Return to Source</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Timeline step ─── */
function TimelineStep({
  icon: Icon, title, timestamp, userName, color, details, photos, signature, extraSignature,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  timestamp: string | null;
  userName: string | null;
  color: string;
  details?: string[];
  photos?: { url: string; fileName?: string }[] | null;
  signature?: string | null;
  extraSignature?: string | null;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div className="grid place-items-center size-6 rounded-full shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          <Icon className="size-3" style={{ color }} />
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          {timestamp ? (
            <span className="text-[0.5rem] tabular-nums shrink-0" style={{ color: "var(--color-ink-500)" }}>
              {new Date(timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {new Date(timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : (
            <span className="text-[0.5rem]" style={{ color: "var(--color-ink-300)" }}>Pending</span>
          )}
        </div>
        {userName ? (
          <p className="text-[0.5rem] flex items-center gap-1" style={{ color: "var(--color-ink-500)" }}>
            <User className="size-2.5" /> {userName}
          </p>
        ) : null}
        {details && details.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {details.map((d, i) => (
              <p key={i} className="text-[0.5rem]" style={{ color: "var(--color-ink-600)" }}>{d}</p>
            ))}
          </div>
        ) : null}
        {photos && photos.length > 0 ? (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt={p.fileName ?? "proof"} className="size-12 rounded-[0.25rem] object-cover" style={{ border: "1px solid var(--color-line)" }} />
            ))}
          </div>
        ) : null}
        {signature ? (
          <div className="mt-1.5">
            <p className="text-[0.4375rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-400)" }}>Receiver signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signature} alt="receiver signature" className="max-h-12 rounded-[0.25rem]" style={{ border: "1px solid var(--color-line)" }} />
          </div>
        ) : null}
        {extraSignature ? (
          <div className="mt-1.5">
            <p className="text-[0.4375rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-400)" }}>Supervisor signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={extraSignature} alt="supervisor signature" className="max-h-12 rounded-[0.25rem]" style={{ border: "1px solid var(--color-line)" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Info row ─── */
function InfoRow({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-1.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      <Icon className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
      <div className="min-w-0 flex-1">
        <span className="text-[0.4375rem] font-semibold uppercase block" style={{ color: "var(--color-ink-500)" }}>{label}</span>
        <span className="text-[0.6875rem] font-bold block" style={{ color: "var(--color-ink-950)" }}>{value}</span>
      </div>
    </div>
  );
}

/* ─── Transport field ─── */
function TransportField({
  icon: Icon, label, value, mono, muted,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="size-3 shrink-0" style={{ color: muted ? "var(--color-ink-300)" : "var(--color-ink-400)" }} />
      <div className="min-w-0">
        <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-400)" }}>{label}</p>
        <p className={`text-[0.625rem] font-bold truncate ${mono ? "font-mono" : ""}`} style={{ color: muted ? "var(--color-ink-400)" : "var(--color-ink-950)" }}>{value}</p>
      </div>
    </div>
  );
}
