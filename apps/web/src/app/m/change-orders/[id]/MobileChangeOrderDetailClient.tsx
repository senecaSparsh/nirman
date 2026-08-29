"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Check, X, Ban, Play, Trash2, Pencil } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { ActionBar, MobileStatusBadge } from "@/components/mobile/v2/primitives";

interface ChangeOrderDetail {
  id: string;
  changeOrderNo: string;
  title: string;
  description: string;
  type: string;
  reason: string;
  status: string;
  projectName: string;
  phaseName: string | null;
  originalAmount: number;
  revisedAmount: number;
  costDelta: number;
  scheduleDeltaDays: number;
  clientApprovalRequired: boolean;
  clientApprovedBy: string | null;
  clientApprovedAt: string | null;
  initiatedBy: string | null;
  notes: string | null;
  rejectReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  implementedByName: string | null;
  lines: Array<{
    id: string;
    description: string;
    originalQty: number;
    revisedQty: number;
    unit: string;
    rate: number;
    originalAmount: number;
    revisedAmount: number;
    amountDelta: number;
    boqItemSerial: string | null;
    boqItemDescription: string | null;
    notes: string | null;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  ADDITION: "Addition",
  DELETION: "Deletion",
  MODIFICATION: "Modification",
  ACCELERATION: "Acceleration",
  DECELERATION: "Deceleration",
  VARIATION: "Variation",
};

const REASON_LABELS: Record<string, string> = {
  CLIENT_REQUEST: "Client Request",
  SITE_CONDITION: "Site Condition",
  DESIGN_CHANGE: "Design Change",
  ERROR_OMISSION: "Error / Omission",
  REGULATORY: "Regulatory",
  VALUE_ENGINEERING: "Value Engineering",
  OTHER: "Other",
};

export function MobileChangeOrderDetailClient({
  co,
  canManage,
}: {
  co: ChangeOrderDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [clientApprovedBy, setClientApprovedBy] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: co.title,
    description: co.description,
    type: co.type,
    reason: co.reason,
    scheduleDeltaDays: co.scheduleDeltaDays,
    clientApprovalRequired: co.clientApprovalRequired,
    initiatedBy: co.initiatedBy ?? "",
    notes: co.notes ?? "",
  });

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    haptic(20);
    try {
      const res = await fetch(`/api/change-orders/${co.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Change order ${action}ed`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
      setShowReject(false);
      setShowApprove(false);
      setRejectReason("");
      setClientApprovedBy("");
    }
  }

  async function saveEdit() {
    setActing("edit");
    haptic(20);
    try {
      const res = await fetch(`/api/change-orders/${co.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          type: editForm.type,
          reason: editForm.reason,
          scheduleDeltaDays: editForm.scheduleDeltaDays,
          clientApprovalRequired: editForm.clientApprovalRequired,
          initiatedBy: editForm.initiatedBy || null,
          notes: editForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Change order updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
      setShowEdit(false);
    }
  }

  const costDeltaPositive = co.costDelta > 0;
  const costDeltaNegative = co.costDelta < 0;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div
        className="rounded-[0.5rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {co.changeOrderNo}
          </p>
          <MobileStatusBadge status={co.status} />
        </div>
        <h1 className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {co.title}
        </h1>
        <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
          {TYPE_LABELS[co.type] ?? co.type} · {REASON_LABELS[co.reason] ?? co.reason}
        </p>
        <p className="text-m-label mt-1" style={{ color: "var(--color-ink-500)" }}>
          {co.projectName}{co.phaseName ? ` · ${co.phaseName}` : ""}
        </p>
      </div>

      {/* Description */}
      <div
        className="rounded-[0.5rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Description</p>
        <p className="text-m-section leading-relaxed" style={{ color: "var(--color-ink-950)" }}>
          {co.description}
        </p>
        {co.initiatedBy && (
          <p className="text-m-label mt-2" style={{ color: "var(--color-ink-500)" }}>
            Initiated by: <span style={{ color: "var(--color-ink-950)", fontWeight: 600 }}>{co.initiatedBy}</span>
          </p>
        )}
      </div>

      {/* Impact summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>Original Amount</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(co.originalAmount)}
          </p>
        </div>
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>Revised Amount</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(co.revisedAmount)}
          </p>
        </div>
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>Cost Delta</p>
          <p
            className="text-m-section font-bold tabular-nums"
            style={{ color: costDeltaPositive ? "var(--color-stop)" : costDeltaNegative ? "var(--color-go)" : "var(--color-ink-950)" }}
          >
            {costDeltaPositive ? "+" : ""}{formatCurrency(co.costDelta)}
          </p>
        </div>
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>Schedule Delta</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {co.scheduleDeltaDays > 0 ? "+" : ""}{co.scheduleDeltaDays} days
          </p>
        </div>
      </div>

      {/* Lines */}
      <div
        className="rounded-[0.5rem] border overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-label font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Line Items ({co.lines.length})
          </p>
        </div>
        {co.lines.map((l, i) => (
          <div key={l.id} className="px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0">
                <p className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
                  {l.description}
                </p>
                {l.boqItemSerial && (
                  <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    BOQ: {l.boqItemSerial} — {l.boqItemDescription}
                  </p>
                )}
              </div>
              <p
                className="text-m-label font-bold tabular-nums shrink-0 ml-2"
                style={{ color: l.amountDelta > 0 ? "var(--color-stop)" : l.amountDelta < 0 ? "var(--color-go)" : "var(--color-ink-500)" }}
              >
                {l.amountDelta > 0 ? "+" : ""}{formatCurrency(l.amountDelta)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-m-label tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              <span>{l.originalQty} → {l.revisedQty} {l.unit}</span>
              <span>·</span>
              <span>@ {formatCurrency(l.rate)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Approval timeline */}
      <div
        className="rounded-[0.5rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-label font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Created" date={co.createdAt} />
          {co.submittedAt && <TimelineRow label="Submitted" date={co.submittedAt} name={co.submittedByName} />}
          {co.approvedAt && <TimelineRow label="Approved" date={co.approvedAt} name={co.approvedByName} />}
          {co.clientApprovedBy && <TimelineRow label="Client Approved" date={co.clientApprovedAt ?? co.approvedAt ?? co.createdAt} name={co.clientApprovedBy} />}
          {co.implementedAt && <TimelineRow label="Implemented" date={co.implementedAt} name={co.implementedByName} />}
          {co.rejectReason && (
            <div className="mt-2 rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-stop-bg, rgba(220,38,38,0.08))" }}>
              <p className="text-m-label font-bold" style={{ color: "var(--color-stop)" }}>Rejected</p>
              <p className="text-m-label" style={{ color: "var(--color-ink-700)" }}>{co.rejectReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {co.notes && (
        <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Notes</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{co.notes}</p>
        </div>
      )}

      {/* Workflow actions */}
      {canManage && (
        <ActionBar>
          {co.status === "DRAFT" && (
            <ActionButton
              onClick={() => setShowEdit(true)}
              loading={false}
              icon={Pencil}
              label="Edit"
              variant="secondary"
            />
          )}
          {(co.status === "DRAFT" || co.status === "REJECTED") && (
            <ActionButton
              onClick={() => doAction("submit")}
              loading={acting === "submit"}
              icon={Send}
              label="Submit for Approval"
              variant="primary"
            />
          )}
          {co.status === "SUBMITTED" && co.clientApprovalRequired && (
            <ActionButton
              onClick={() => setShowApprove(true)}
              loading={false}
              icon={Check}
              label="Approve"
              variant="go"
            />
          )}
          {co.status === "SUBMITTED" && !co.clientApprovalRequired && (
            <ActionButton
              onClick={() => doAction("approve")}
              loading={acting === "approve"}
              icon={Check}
              label="Approve"
              variant="go"
            />
          )}
          {co.status === "SUBMITTED" && (
            <ActionButton
              onClick={() => setShowReject(true)}
              loading={false}
              icon={X}
              label="Reject"
              variant="danger"
            />
          )}
          {co.status === "APPROVED" && (
            <ActionButton
              onClick={() => doAction("implement")}
              loading={acting === "implement"}
              icon={Play}
              label="Implement (Apply to BOQ)"
              variant="primary"
            />
          )}
          {(co.status === "DRAFT" || co.status === "REJECTED") && (
            <ActionButton
              onClick={() => doAction("cancel")}
              loading={acting === "cancel"}
              icon={Ban}
              label="Cancel"
              variant="secondary"
            />
          )}
          {(co.status === "DRAFT" || co.status === "REJECTED" || co.status === "CANCELLED") && (
            <ActionButton
              onClick={async () => {
                const ok = await confirm({ title: "Delete?", description: "Delete this change order? This cannot be undone.", confirmLabel: "Delete", variant: "destructive" });
                if (!ok) return;
                await doAction("delete");
                router.push("/m/change-orders");
              }}
              loading={acting === "delete"}
              icon={Trash2}
              label="Delete"
              variant="danger"
            />
          )}
        </ActionBar>
      )}

      {/* Reject dialog */}
      {showReject && (
        <BottomSheet title="Reject Change Order" onClose={() => setShowReject(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this change order being rejected?"
                className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <button
              onClick={() => {
                if (!rejectReason.trim()) { toast.error("Reason is required"); return; }
                doAction("reject", { reason: rejectReason });
              }}
              disabled={acting === "reject"}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press"
              style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
            >
              {acting === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Confirm Rejection
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Approve dialog (with client approval) */}
      {showApprove && (
        <BottomSheet title="Approve Change Order" onClose={() => setShowApprove(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Client Approval By</label>
              <input
                value={clientApprovedBy}
                onChange={(e) => setClientApprovedBy(e.target.value)}
                placeholder="Client name (who approved)"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <button
              onClick={() => {
                if (!clientApprovedBy.trim()) { toast.error("Client name is required"); return; }
                doAction("approve", { clientApprovedBy });
              }}
              disabled={acting === "approve"}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}
            >
              {acting === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirm Approval
            </button>
          </div>
        </BottomSheet>
      )}
      {/* Edit dialog */}
      {showEdit && (
        <BottomSheet title="Edit Change Order" onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
                className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Type</label>
              <select
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Reason</label>
              <select
                value={editForm.reason}
                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Schedule Delta (days)</label>
              <input
                type="number"
                value={editForm.scheduleDeltaDays}
                onChange={(e) => setEditForm({ ...editForm, scheduleDeltaDays: Number(e.target.value) })}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Initiated By</label>
              <input
                value={editForm.initiatedBy}
                onChange={(e) => setEditForm({ ...editForm, initiatedBy: e.target.value })}
                placeholder="Who initiated this change order"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
                placeholder="Optional notes"
                className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.clientApprovalRequired}
                onChange={(e) => setEditForm({ ...editForm, clientApprovalRequired: e.target.checked })}
                className="size-4"
              />
              <span className="text-m-section" style={{ color: "var(--color-ink-950)" }}>Client Approval Required</span>
            </label>
            <button
              onClick={() => {
                if (!editForm.title.trim()) { toast.error("Title is required"); return; }
                if (!editForm.description.trim()) { toast.error("Description is required"); return; }
                saveEdit();
              }}
              disabled={acting === "edit"}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {acting === "edit" ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              Save Changes
            </button>
          </div>
        </BottomSheet>
      )}
      {confirmDialog}
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>{label}</p>
        {name && <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>by {name}</p>}
      </div>
      <p className="text-m-label tabular-nums" style={{ color: "var(--color-ink-500)" }}>{formatDate(date)}</p>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  loading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: "primary" | "go" | "danger" | "secondary";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", borderColor: "var(--color-ink-950)" },
    go: { backgroundColor: "var(--color-go)", color: "var(--color-ink-950)", borderColor: "var(--color-go-active)" },
    danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", borderColor: "var(--color-line)" },
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full h-11 rounded-[0.5rem] border text-m-body font-bold flex items-center justify-center gap-1.5 text-m-body press"
      style={styles[variant]}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(18, 17, 13, 0.4)" }}>
      <div
        className="mt-auto rounded-t-[1rem] max-h-[60vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</h2>
          <button onClick={onClose} className="text-m-body press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
