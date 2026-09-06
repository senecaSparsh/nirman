"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Truck,
  Printer,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Send,
  Trash2,
  Plus,
  Loader2,
  Phone,
  Building2,
  FileText,
  Navigation,
  X,
  FolderOpen,
} from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileFab,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileProjectSelect } from "@/components/mobile/selectors";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type GatePassRow = {
  id: string;
  gatePassNumber: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "EXITED" | "CANCELLED";
  category: string;
  locationName: string;
  vehicleNumber: string | null;
  vehicleType: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;
  destination: string | null;
  purpose: string | null;
  notes: string | null;
  approvalNotes: string | null;
  exitNotes: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  exitedAt: string | null;
  approvedByName: string | null;
  createdByName: string | null;
  submittedByName: string | null;
  rejectedByName: string | null;
  exitedByName: string | null;
  rejectionReason: string | null;
  lineCount: number;
  lines: {
    id: string;
    materialCode: string | null;
    materialName: string | null;
    unit: string | null;
    qty: number;
    description: string | null;
  }[];
};

const STATUS_CONFIG: Record<GatePassRow["status"], { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "var(--color-ink-500)", bg: "var(--color-paper-2)" },
  PENDING: { label: "Pending", color: "var(--color-signal)", bg: "color-mix(in srgb, var(--color-signal) 10%, transparent)" },
  APPROVED: { label: "Approved", color: "var(--color-go)", bg: "color-mix(in srgb, var(--color-go) 10%, transparent)" },
  REJECTED: { label: "Rejected", color: "var(--color-stop)", bg: "color-mix(in srgb, var(--color-stop) 10%, transparent)" },
  EXITED: { label: "Exited", color: "var(--color-ink-700)", bg: "color-mix(in srgb, var(--color-ink-700) 10%, transparent)" },
  CANCELLED: { label: "Cancelled", color: "var(--color-ink-500)", bg: "var(--color-paper-2)" },
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  PICKUP: "Pickup",
  TRUCK: "Truck",
  TRACTOR: "Tractor",
  MINI_TRUCK: "Mini Truck",
  AUTO: "Auto",
  OTHER: "Other",
};

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL_ISSUE: "Material Issue",
  STOCK_TRANSFER: "Stock Transfer",
  MATERIAL_SALE: "Material Sale",
  SUPPLIER_RETURN: "Supplier Return",
  MANUAL: "Manual",
};

export function MobileGatePassList({
  gatePasses,
  canApprove,
  canExit,
  canCreate,
  canManage,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  gatePasses: GatePassRow[];
  canApprove: boolean;
  canExit: boolean;
  canCreate: boolean;
  canManage: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rejectTarget, setRejectTarget] = useState<GatePassRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<GatePassRow | null>(null);
  const [exitTarget, setExitTarget] = useState<GatePassRow | null>(null);
  const [exitNotes, setExitNotes] = useState("");
  const [exitPhotos, setExitPhotos] = useState<{ url: string; fileName?: string }[]>([]);

  // ── Optimistic updates: maintain a local copy of gate passes that
  // updates immediately on action, then syncs with server. If the server
  // fails, we revert to the original prop data.
  const [localGps, setLocalGps] = useState<GatePassRow[]>(gatePasses);
  // Keep local state in sync when server data changes (e.g. after router.refresh())
  useEffect(() => { setLocalGps(gatePasses); }, [gatePasses]);

  function updateGpStatus(id: string, status: GatePassRow["status"]) {
    setLocalGps((prev) => prev.map((gp) => gp.id === id ? { ...gp, status } : gp));
  }

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return localGps;
    const q = query.toLowerCase();
    return localGps.filter((gp) =>
      gp.gatePassNumber.toLowerCase().includes(q) ||
      (gp.vehicleNumber ?? "").toLowerCase().includes(q) ||
      (gp.driverName ?? "").toLowerCase().includes(q) ||
      (gp.destination ?? "").toLowerCase().includes(q),
    );
  }, [localGps, query]);

  const handleAction = useCallback(
    async (id: string, action: string, body?: Record<string, unknown>) => {
      // ── Optimistic update: immediately update the status in local state ──
      const optimisticStatus: GatePassRow["status"] | null =
        action === "submit" ? "PENDING"
        : action === "approve" ? "APPROVED"
        : action === "reject" ? "REJECTED"
        : action === "confirmExit" ? "EXITED"
        : action === "resubmit" ? "PENDING"
        : action === "cancel" ? "CANCELLED"
        : null;

      if (optimisticStatus) {
        updateGpStatus(id, optimisticStatus);
      }

      setActionLoading(id);
      try {
        const res = await fetch(`/api/gate-passes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Action failed");
        toast.success(`Gate pass ${action}ed`);
        router.refresh();
      } catch (err: unknown) {
        // ── Revert: restore the original status from server props ──
        const original = gatePasses.find((gp) => gp.id === id);
        if (original) updateGpStatus(id, original.status);
        toast.error(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActionLoading(null);
      }
    },
    [router, gatePasses],
  );

  const submitReject = useCallback(() => {
    if (!rejectTarget || !rejectReason.trim()) return;
    handleAction(rejectTarget.id, "reject", { reason: rejectReason.trim() });
    setRejectTarget(null);
    setRejectReason("");
  }, [rejectTarget, rejectReason, handleAction]);

  const submitCancel = useCallback(() => {
    if (!cancelTarget) return;
    handleAction(cancelTarget.id, "cancel");
    setCancelTarget(null);
  }, [cancelTarget, handleAction]);

  // Sort: APPROVED first (ready for exit), then PENDING, then REJECTED, then EXITED, then DRAFT
  const sorted = [...filtered].sort((a, b) => {
    const order = { APPROVED: 0, PENDING: 1, REJECTED: 2, EXITED: 3, DRAFT: 4, CANCELLED: 5 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  return (
    <div className="space-y-2.5">
      {/* Search bar */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search by GP no, vehicle, driver…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {sorted.length === 0 && query && (
        <MobileNoResults title="No gate passes found" query={query} />
      )}

      {sorted.map((gp) => {
        const cfg = STATUS_CONFIG[gp.status];
        const isExpanded = expanded.has(gp.id);
        return (
          <div key={gp.id} className="rounded-[0.625rem] border overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: cfg.bg }}>
            {/* Header */}
            <button
              onClick={() => toggle(gp.id)}
              className="flex w-full items-center justify-between p-3 text-left press"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-m-caption font-medium" style={{ color: "var(--color-ink-950)" }}>{gp.gatePassNumber}</span>
                  <span className="text-m-label font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                </div>
                <div className="mt-0.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {gp.lineCount} items · {gp.locationName}
                </div>
                {gp.vehicleNumber && (
                  <div className="mt-0.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    🚚 {gp.vehicleNumber}
                    {gp.driverName && ` · ${gp.driverName}`}
                  </div>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              ) : (
                <ChevronDown className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
                {/* Category badge */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-m-label font-medium" style={{ borderColor: "var(--color-ink-300)", backgroundColor: "color-mix(in srgb, var(--color-ink-950) 10%, transparent)", color: "var(--color-ink-950)" }}>
                    <ShieldCheck className="size-2.5" />
                    {CATEGORY_LABELS[gp.category] ?? gp.category}
                  </span>
                </div>

                {/* Items */}
                <div>
                  <div className="text-m-label font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-ink-500)" }}>Items</div>
                  <div className="space-y-1">
                    {gp.lines.map((l) => (
                      <div key={l.id} className="flex justify-between text-m-caption">
                        <span className="min-w-0 flex-1 truncate">
                          {l.materialName ?? l.description ?? "—"}
                        </span>
                        <span className="tnum font-medium ml-2">
                          {formatNumber(l.qty, 3)} {l.unit ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rejection reason */}
                {gp.status === "REJECTED" && gp.rejectionReason && (
                  <div className="rounded-[0.375rem] border px-2 py-1.5 text-m-caption" style={{ borderColor: "var(--color-stop)", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)", color: "var(--color-stop)" }}>
                    <span className="font-medium">Rejected:</span> {gp.rejectionReason}
                    {gp.rejectedByName && <div className="mt-0.5 text-m-caption">by {gp.rejectedByName}</div>}
                  </div>
                )}

                {/* Approval notes */}
                {gp.approvalNotes && (
                  <div className="rounded-[0.375rem] border px-2 py-1.5 text-m-caption" style={{ borderColor: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 5%, transparent)", color: "var(--color-go)" }}>
                    <span className="font-medium">Approval notes:</span> {gp.approvalNotes}
                  </div>
                )}

                {/* Exit notes */}
                {gp.exitNotes && (
                  <div className="rounded-[0.375rem] border px-2 py-1.5 text-m-caption" style={{ borderColor: "var(--color-ink-700)", backgroundColor: "color-mix(in srgb, var(--color-ink-700) 5%, transparent)", color: "var(--color-ink-700)" }}>
                    <span className="font-medium">Exit notes:</span> {gp.exitNotes}
                    {gp.exitedByName && <div className="mt-0.5 text-m-caption">by {gp.exitedByName}</div>}
                  </div>
                )}

                {/* Transport details */}
                <div className="text-m-caption space-y-0.5" style={{ color: "var(--color-ink-500)" }}>
                  {gp.destination && (
                    <div className="flex items-center gap-1.5">
                      <Navigation className="size-3 shrink-0" />
                      <span>Destination: {gp.destination}</span>
                    </div>
                  )}
                  {gp.purpose && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="size-3 shrink-0" />
                      <span>Purpose: {gp.purpose}</span>
                    </div>
                  )}
                  {gp.vehicleType && (
                    <div className="flex items-center gap-1.5">
                      <Truck className="size-3 shrink-0" />
                      <span>Vehicle: {VEHICLE_TYPE_LABELS[gp.vehicleType] ?? gp.vehicleType}</span>
                    </div>
                  )}
                  {gp.transporterName && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="size-3 shrink-0" />
                      <span>Transporter: {gp.transporterName}</span>
                    </div>
                  )}
                  {gp.driverPhone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3 shrink-0" />
                      <a href={`tel:${gp.driverPhone}`} className="text-m-caption ">{gp.driverPhone}</a>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="text-m-caption space-y-0.5 border-t pt-2" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>
                  {gp.createdByName && <div>Created by: {gp.createdByName} · {formatDate(gp.createdAt)}</div>}
                  {gp.submittedByName && gp.submittedAt && <div>Submitted by: {gp.submittedByName} · {formatDate(gp.submittedAt)}</div>}
                  {gp.approvedByName && gp.approvedAt && <div>Approved by: {gp.approvedByName} · {formatDate(gp.approvedAt)}</div>}
                  {gp.exitedByName && gp.exitedAt && <div>Exited by: {gp.exitedByName} · {formatDate(gp.exitedAt)}</div>}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => window.open(`/print/gate-pass/${gp.id}`, "_blank")}
                    className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption active:opacity-70 press"
                    style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
                  >
                    <Printer className="size-3" /> Print
                  </button>

                  {/* Submit: DRAFT → PENDING */}
                  {gp.status === "DRAFT" && canCreate && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => handleAction(gp.id, "submit")}
                      className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press"
                      style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}
                    >
                      {actionLoading === gp.id ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                      Submit
                    </button>
                  )}

                  {/* Approve + Reject: PENDING */}
                  {gp.status === "PENDING" && canApprove && (
                    <>
                      <button
                        disabled={actionLoading === gp.id}
                        onClick={() => { setRejectTarget(gp); setRejectReason(""); }}
                        className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption press"
                        style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)" }}
                      >
                        <XCircle className="size-3" /> Reject
                      </button>
                      <button
                        disabled={actionLoading === gp.id}
                        onClick={() => handleAction(gp.id, "approve")}
                        className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press"
                        style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}
                      >
                        {actionLoading === gp.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                        Approve
                      </button>
                    </>
                  )}

                  {/* Confirm Exit: APPROVED → EXITED */}
                  {gp.status === "APPROVED" && canExit && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => {
                        setExitTarget(gp);
                        setExitNotes("");
                        setExitPhotos([]);
                      }}
                      className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press active:scale-95"
                      style={{ backgroundColor: "var(--color-ink-700)", color: "var(--color-paper)" }}
                    >
                      {actionLoading === gp.id ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
                      Confirm Exit
                    </button>
                  )}

                  {/* Resubmit: REJECTED → PENDING */}
                  {gp.status === "REJECTED" && canCreate && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => handleAction(gp.id, "resubmit")}
                      className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption active:opacity-70 press"
                      style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
                    >
                      {actionLoading === gp.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                      Resubmit
                    </button>
                  )}

                  {/* Cancel: DRAFT or PENDING → CANCELLED */}
                  {(gp.status === "DRAFT" || gp.status === "PENDING") && canManage && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => setCancelTarget(gp)}
                      className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption press"
                      style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-3" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Reject dialog */}
      {rejectTarget && (
        <MobileDialog open={true} onClose={() => setRejectTarget(null)} title={`Reject ${rejectTarget.gatePassNumber}`}>
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder="Why is this gate pass being rejected?"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ backgroundColor: "transparent" }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption active:opacity-70 press"
              >
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim() || actionLoading === rejectTarget.id}
                onClick={submitReject}
                className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                Reject Gate Pass
              </button>
            </div>
          </MobileDialog>
      )}

      {/* Cancel dialog */}
      {cancelTarget && (
        <MobileDialog open={true} onClose={() => setCancelTarget(null)} title={`Cancel ${cancelTarget.gatePassNumber}`}>
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {cancelTarget.category !== "MANUAL"
                ? "This will also cancel the linked transaction (issue/sale). This cannot be undone."
                : "This gate pass will be permanently cancelled. This cannot be undone."}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption active:opacity-70 press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
              >
                Keep
              </button>
              <button
                disabled={actionLoading === cancelTarget.id}
                onClick={submitCancel}
                className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                {actionLoading === cancelTarget.id ? <Loader2 className="size-3.5 animate-spin" /> : "Cancel Gate Pass"}
              </button>
            </div>
          </MobileDialog>
      )}

      {/* Exit confirmation dialog with photo capture */}
      {exitTarget && (
        <MobileDialog open={true} onClose={() => setExitTarget(null)} title={`Confirm Exit — ${exitTarget.gatePassNumber}`}>
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Confirm items have physically left the gate.
            </div>
            <div className="space-y-1.5">
              <label className="text-m-caption font-semibold" style={{ color: "var(--color-ink-600)" }}>Exit Notes</label>
              <textarea
                value={exitNotes}
                onChange={(e) => setExitNotes(e.target.value)}
                rows={2}
                placeholder="Optional — any observations at the gate"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ backgroundColor: "transparent" }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-m-caption font-semibold">Exit Photos</label>
              <PhotoUploader photos={exitPhotos} onChange={setExitPhotos} maxPhotos={4} />
              <p className="text-m-caption">Photograph the loaded vehicle as it exits.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setExitTarget(null)}
                className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption active:opacity-70 press"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading === exitTarget.id}
                onClick={async () => {
                  setActionLoading(exitTarget.id);
                  try {
                    const res = await fetch(`/api/gate-passes/${exitTarget.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "confirmExit",
                        exitNotes: exitNotes.trim() || undefined,
                        exitPhotos: exitPhotos.length > 0 ? exitPhotos : undefined,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Action failed");
                    toast.success("Gate pass exited");
                    setExitTarget(null);
                    setExitNotes("");
                    setExitPhotos([]);
                    router.refresh();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Action failed");
                  } finally {
                    setActionLoading(null);
                  }
                }}
                className="flex items-center gap-1 rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press active:scale-95 disabled:opacity-50"
              >
                {actionLoading === exitTarget.id ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
                Confirm Exit
              </button>
            </div>
          </MobileDialog>
      )}
    </div>
  );
}

// ── Create Form Dialog ──────────────────────────────────────────

export function MobileGatePassFormDialog({
  locations,
  projects,
}: {
  locations: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fab = useFabModal();
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [locationId, setLocationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("PICKUP");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [notes, setNotes] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [lines, setLines] = useState<{ description: string; qty: string; unit: string }[]>([
    { description: "", qty: "", unit: "" },
  ]);

  function resetForm() {
    setLocationId("");
    setProjectId("");
    setDestination("");
    setPurpose("");
    setVehicleNumber("");
    setVehicleType("PICKUP");
    setDriverName("");
    setDriverPhone("");
    setTransporterName("");
    setNotes("");
    setAutoSubmit(true);
    setLines([{ description: "", qty: "", unit: "" }]);
  }

  function handleClose() {
    fab.close();
    resetForm();
  }

  async function handleSubmit() {
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim() && l.qty);
    if (validLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/gate-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          projectId: projectId || undefined,
          category: "MANUAL",
          destination: destination.trim() || undefined,
          purpose: purpose.trim() || undefined,
          vehicleNumber: vehicleNumber.trim() || undefined,
          vehicleType,
          driverName: driverName.trim() || undefined,
          driverPhone: driverPhone.trim() || undefined,
          transporterName: transporterName.trim() || undefined,
          notes: notes.trim() || undefined,
          autoSubmit,
          lines: validLines.map((l) => ({
            description: l.description.trim(),
            qty: Number(l.qty),
            unit: l.unit.trim() || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create gate pass");
      toast.success(autoSubmit ? "Gate pass submitted for approval" : "Gate pass saved as draft");
      handleClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create gate pass");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="New gate pass" />

      <MobileFabModal open={fab.isOpen} onClose={handleClose} originRect={fab.originRect} title="New Gate Pass">
        <div className="flex flex-col gap-3">
          {/* ══════ SECTION: Location ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Location
            </p>
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Location <span className="">*</span>
              </label>
              <MobileSelectWithCreate
                label="Location"
                required
                value={locationId}
                onChange={setLocationId}
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="Select location…"
              />
            </div>
            {projects.length > 0 && (
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Project (optional)
                </label>
                <MobileProjectSelect
                label="Project"
                value={projectId}
                onChange={setProjectId}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="No project"
                icon={FolderOpen}
              />
              </div>
            )}
          </div>

          {/* ══════ SECTION: Transport ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Transport
            </p>

            {/* Destination + Purpose */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div className="pr-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Destination
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Where to?"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
              <div className="pl-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Purpose
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Why?"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>

            {/* Vehicle Number + Vehicle Type */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div className="pr-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="HR26 AB 1234"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
              <div className="pl-2">
                <EnumSelect
                  label="Vehicle Type"
                  value={vehicleType}
                  onChange={(v) => setVehicleType(v)}
                  options={Object.entries(VEHICLE_TYPE_LABELS).map(([v, label]) => ({ value: v, label }))}
                />
              </div>
            </div>

            {/* Driver Name + Driver Phone */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div className="pr-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Driver Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver name"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
              <div className="pl-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Driver Phone
                </label>
                <input
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="+91…"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>

            {/* Transporter */}
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Transporter
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                placeholder="Transporter name"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* ══════ SECTION: Items ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Items <span className="">*</span>
              </p>
              <button
                onClick={() => setLines([...lines, { description: "", qty: "", unit: "" }])}
                className="text-m-caption press"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, description: e.target.value } : l))}
                      placeholder="Description"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <input
                      type="number"
                      value={line.qty}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))}
                      placeholder="Qty"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, unit: e.target.value } : l))}
                      placeholder="Unit"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  {lines.length > 1 && (
                    <button
                      onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      className="shrink-0 press pb-1"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes…"
                className="w-full px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>

            {/* Auto-submit toggle */}
            <label className="flex items-center gap-2 text-m-caption">
              <input
                type="checkbox"
                checked={autoSubmit}
                onChange={(e) => setAutoSubmit(e.target.checked)}
                className="size-4 rounded"
              />
              <span>Submit for approval immediately</span>
            </label>
          </div>

          {/* ══════ Sticky action bar ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t flex items-center justify-between px-3 py-2"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
          >
            <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {lines.filter((l) => l.description.trim() && l.qty).length} item{lines.filter((l) => l.description.trim() && l.qty).length !== 1 ? "s" : ""}
            </div>
            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {autoSubmit ? "Create & Submit" : "Create Draft"}
            </button>
          </div>
        </div>
      </MobileFabModal>
    </>
  );
}
