"use client";

import { useState, useMemo, useCallback } from "react";
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
  Search,
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
} from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";

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
  DRAFT: { label: "Draft", color: "text-muted-foreground", bg: "bg-muted/10" },
  PENDING: { label: "Pending", color: "text-warning", bg: "bg-warning/10" },
  APPROVED: { label: "Approved", color: "text-success", bg: "bg-success/10" },
  REJECTED: { label: "Rejected", color: "text-danger", bg: "bg-danger/10" },
  EXITED: { label: "Exited", color: "text-info", bg: "bg-info/10" },
  CANCELLED: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted/10" },
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
}: {
  gatePasses: GatePassRow[];
  canApprove: boolean;
  canExit: boolean;
  canCreate: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rejectTarget, setRejectTarget] = useState<GatePassRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<GatePassRow | null>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return gatePasses;
    const q = query.toLowerCase();
    return gatePasses.filter((gp) =>
      gp.gatePassNumber.toLowerCase().includes(q) ||
      (gp.vehicleNumber ?? "").toLowerCase().includes(q) ||
      (gp.driverName ?? "").toLowerCase().includes(q) ||
      (gp.destination ?? "").toLowerCase().includes(q),
    );
  }, [gatePasses, query]);

  const handleAction = useCallback(
    async (id: string, action: string, body?: Record<string, unknown>) => {
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
        toast.error(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActionLoading(null);
      }
    },
    [router],
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
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by GP no, vehicle, driver…"
          className="w-full rounded-md border border-border bg-card py-2 pl-8 pr-3 text-caption text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {sorted.length === 0 && query && (
        <div className="py-6 text-center text-caption text-muted-foreground">No gate passes match &quot;{query}&quot;</div>
      )}

      {sorted.map((gp) => {
        const cfg = STATUS_CONFIG[gp.status];
        const isExpanded = expanded.has(gp.id);
        return (
          <div key={gp.id} className={`rounded-lg border border-border ${cfg.bg} overflow-hidden`}>
            {/* Header */}
            <button
              onClick={() => toggle(gp.id)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-caption font-medium">{gp.gatePassNumber}</span>
                  <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="mt-0.5 text-caption text-muted-foreground">
                  {gp.lineCount} items · {gp.locationName}
                </div>
                {gp.vehicleNumber && (
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    🚚 {gp.vehicleNumber}
                    {gp.driverName && ` · ${gp.driverName}`}
                  </div>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border/40 p-3 space-y-3">
                {/* Category badge */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    {CATEGORY_LABELS[gp.category] ?? gp.category}
                  </span>
                </div>

                {/* Items */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Items</div>
                  <div className="space-y-1">
                    {gp.lines.map((l) => (
                      <div key={l.id} className="flex justify-between text-caption">
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
                  <div className="rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5 text-caption text-danger">
                    <span className="font-medium">Rejected:</span> {gp.rejectionReason}
                    {gp.rejectedByName && <div className="mt-0.5 text-meta">by {gp.rejectedByName}</div>}
                  </div>
                )}

                {/* Approval notes */}
                {gp.approvalNotes && (
                  <div className="rounded-md border border-success/30 bg-success/5 px-2 py-1.5 text-caption text-success">
                    <span className="font-medium">Approval notes:</span> {gp.approvalNotes}
                  </div>
                )}

                {/* Exit notes */}
                {gp.exitNotes && (
                  <div className="rounded-md border border-info/30 bg-info/5 px-2 py-1.5 text-caption text-info">
                    <span className="font-medium">Exit notes:</span> {gp.exitNotes}
                    {gp.exitedByName && <div className="mt-0.5 text-meta">by {gp.exitedByName}</div>}
                  </div>
                )}

                {/* Transport details */}
                <div className="text-caption text-muted-foreground space-y-0.5">
                  {gp.destination && (
                    <div className="flex items-center gap-1.5">
                      <Navigation className="h-3 w-3 shrink-0" />
                      <span>Destination: {gp.destination}</span>
                    </div>
                  )}
                  {gp.purpose && (
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>Purpose: {gp.purpose}</span>
                    </div>
                  )}
                  {gp.vehicleType && (
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3 w-3 shrink-0" />
                      <span>Vehicle: {VEHICLE_TYPE_LABELS[gp.vehicleType] ?? gp.vehicleType}</span>
                    </div>
                  )}
                  {gp.transporterName && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>Transporter: {gp.transporterName}</span>
                    </div>
                  )}
                  {gp.driverPhone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <a href={`tel:${gp.driverPhone}`} className="text-brand hover:underline">{gp.driverPhone}</a>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="text-caption text-muted-foreground space-y-0.5 border-t border-border/40 pt-2">
                  {gp.createdByName && <div>Created by: {gp.createdByName} · {formatDate(gp.createdAt)}</div>}
                  {gp.submittedByName && gp.submittedAt && <div>Submitted by: {gp.submittedByName} · {formatDate(gp.submittedAt)}</div>}
                  {gp.approvedByName && gp.approvedAt && <div>Approved by: {gp.approvedByName} · {formatDate(gp.approvedAt)}</div>}
                  {gp.exitedByName && gp.exitedAt && <div>Exited by: {gp.exitedByName} · {formatDate(gp.exitedAt)}</div>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => window.open(`/print/gate-pass/${gp.id}`, "_blank")}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption hover:bg-muted/20"
                  >
                    <Printer className="h-3 w-3" /> Print
                  </button>

                  {/* Submit: DRAFT → PENDING */}
                  {gp.status === "DRAFT" && canCreate && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => handleAction(gp.id, "submit")}
                      className="flex items-center gap-1 rounded-md bg-warning px-2 py-1 text-caption text-white hover:bg-warning/90"
                    >
                      {actionLoading === gp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Submit
                    </button>
                  )}

                  {/* Approve + Reject: PENDING */}
                  {gp.status === "PENDING" && canApprove && (
                    <>
                      <button
                        disabled={actionLoading === gp.id}
                        onClick={() => { setRejectTarget(gp); setRejectReason(""); }}
                        className="flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-caption text-danger hover:bg-danger/5"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                      <button
                        disabled={actionLoading === gp.id}
                        onClick={() => handleAction(gp.id, "approve")}
                        className="flex items-center gap-1 rounded-md bg-success px-2 py-1 text-caption text-white hover:bg-success/90"
                      >
                        {actionLoading === gp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Approve
                      </button>
                    </>
                  )}

                  {/* Confirm Exit: APPROVED → EXITED */}
                  {gp.status === "APPROVED" && canExit && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => handleAction(gp.id, "confirmExit")}
                      className="flex items-center gap-1 rounded-md bg-info px-2 py-1 text-caption text-white hover:bg-info/90"
                    >
                      {actionLoading === gp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                      Confirm Exit
                    </button>
                  )}

                  {/* Resubmit: REJECTED → PENDING */}
                  {gp.status === "REJECTED" && canCreate && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => handleAction(gp.id, "resubmit")}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption hover:bg-muted/20"
                    >
                      {actionLoading === gp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      Resubmit
                    </button>
                  )}

                  {/* Cancel: DRAFT or PENDING → CANCELLED */}
                  {(gp.status === "DRAFT" || gp.status === "PENDING") && canManage && (
                    <button
                      disabled={actionLoading === gp.id}
                      onClick={() => setCancelTarget(gp)}
                      className="flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-caption text-danger hover:bg-danger/5"
                    >
                      <Trash2 className="h-3 w-3" /> Cancel
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setRejectTarget(null)}>
          <div className="w-full max-w-md rounded-t-lg bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-subhead font-semibold">Reject {rejectTarget.gatePassNumber}</div>
              <div className="text-caption text-muted-foreground">Provide a reason for rejection</div>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this gate pass being rejected?"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                className="rounded-md border border-border px-3 py-1.5 text-caption hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim() || actionLoading === rejectTarget.id}
                onClick={submitReject}
                className="rounded-md bg-danger px-3 py-1.5 text-caption text-white hover:bg-danger/90 disabled:opacity-50"
              >
                Reject Gate Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setCancelTarget(null)}>
          <div className="w-full max-w-md rounded-t-lg bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-subhead font-semibold">Cancel {cancelTarget.gatePassNumber}</div>
              <div className="text-caption text-muted-foreground">
                {cancelTarget.category !== "MANUAL"
                  ? "This will also cancel the linked transaction (issue/sale). This cannot be undone."
                  : "This gate pass will be permanently cancelled. This cannot be undone."}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="rounded-md border border-border px-3 py-1.5 text-caption hover:bg-muted/20"
              >
                Keep
              </button>
              <button
                disabled={actionLoading === cancelTarget.id}
                onClick={submitCancel}
                className="rounded-md bg-danger px-3 py-1.5 text-caption text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {actionLoading === cancelTarget.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancel Gate Pass"}
              </button>
            </div>
          </div>
        </div>
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
  const [open, setOpen] = useState(false);
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
    setOpen(false);
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
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-caption font-semibold text-white hover:bg-brand/90"
      >
        <Plus className="h-3.5 w-3.5" /> New
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={handleClose}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-lg bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="text-subhead font-semibold">New Gate Pass</div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Location */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Location <span className="text-danger">*</span>
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="">Select location…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Project (optional)
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Destination + Purpose */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Destination
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Where to?"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Purpose
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Why?"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            {/* Vehicle details */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="HR26 AB 1234"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Driver Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver name"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Driver Phone
                </label>
                <input
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="+91…"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Transporter
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                placeholder="Transporter name"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Items <span className="text-danger">*</span>
                </label>
                <button
                  onClick={() => setLines([...lines, { description: "", qty: "", unit: "" }])}
                  className="text-caption text-brand hover:underline"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, description: e.target.value } : l))}
                      placeholder="Description"
                      className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-caption focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <input
                      type="number"
                      value={line.qty}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))}
                      placeholder="Qty"
                      className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-caption focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, unit: e.target.value } : l))}
                      placeholder="Unit"
                      className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-caption focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-muted-foreground hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-body focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Auto-submit toggle */}
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={autoSubmit}
                onChange={(e) => setAutoSubmit(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span>Submit for approval immediately</span>
            </label>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleClose}
                className="rounded-md border border-border px-3 py-1.5 text-caption hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-caption font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {autoSubmit ? "Create & Submit" : "Create Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
