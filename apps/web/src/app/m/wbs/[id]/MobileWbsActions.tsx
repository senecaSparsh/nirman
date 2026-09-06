"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Edit3, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

interface FormState {
  name: string;
  description: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  progressPct: string;
  isCritical: boolean;
}

function toDateInput(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

/**
 * MobileWbsEditDialog — bottom-sheet form for editing a WBS node's
 * schedule and progress from the mobile surface. Submits PATCH /api/wbs/nodes/[id].
 */
export function MobileWbsEditDialog({
  open,
  onClose,
  nodeId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  initial: {
    name: string;
    description: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    progressPct: number | string | null;
    isCritical: boolean;
  };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: initial.name,
    description: initial.description ?? "",
    plannedStart: toDateInput(initial.plannedStart),
    plannedEnd: toDateInput(initial.plannedEnd),
    actualStart: toDateInput(initial.actualStart),
    actualEnd: toDateInput(initial.actualEnd),
    progressPct: initial.progressPct != null ? String(initial.progressPct) : "",
    isCritical: initial.isCritical,
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) {
      toast.error("Planned end must be after planned start");
      return;
    }
    const pct = form.progressPct.trim();
    if (pct && (Number(pct) < 0 || Number(pct) > 100)) {
      toast.error("Progress must be between 0 and 100");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        isCritical: form.isCritical,
      };
      if (form.plannedStart) body.plannedStart = new Date(form.plannedStart).toISOString();
      else body.plannedStart = null;
      if (form.plannedEnd) body.plannedEnd = new Date(form.plannedEnd).toISOString();
      else body.plannedEnd = null;
      if (form.actualStart) body.actualStart = new Date(form.actualStart).toISOString();
      else body.actualStart = null;
      if (form.actualEnd) body.actualEnd = new Date(form.actualEnd).toISOString();
      else body.actualEnd = null;
      if (pct) body.progressPct = Number(pct);

      const res = await fetch(`/api/wbs/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update WBS node");
      haptic([10, 40, 80]);
      toast.success("WBS node updated");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <MobileDialog open={open} onClose={onClose} title="Edit WBS Node">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Node Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Node Details
            </p>
            {/* Name */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Name <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={1}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Planned Schedule */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Planned Schedule
            </p>
            {/* Planned dates */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Planned Start
                </label>
                <input
                  type="date"
                  value={form.plannedStart}
                  onChange={(e) => set("plannedStart", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  Planned End
                </label>
                <input
                  type="date"
                  value={form.plannedEnd}
                  onChange={(e) => set("plannedEnd", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Actual Schedule */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Actual Schedule
            </p>
            {/* Actual dates */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Actual Start
                </label>
                <input
                  type="date"
                  value={form.actualStart}
                  onChange={(e) => set("actualStart", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  Actual End
                </label>
                <input
                  type="date"
                  value={form.actualEnd}
                  onChange={(e) => set("actualEnd", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Progress
            </p>
            {/* Progress + Critical */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Progress %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={form.progressPct}
                  onChange={(e) => set("progressPct", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="flex items-end pb-1 pl-2">
                <label
                  className="flex items-center gap-2 cursor-pointer touch"
                  onClick={() => {
                    set("isCritical", !form.isCritical);
                    haptic(10);
                  }}
                >
                  <span
                    className="grid place-items-center size-5 rounded-[0.375rem] border-2"
                    style={{
                      borderColor: form.isCritical
                        ? "var(--color-stop)"
                        : "var(--color-line)",
                      backgroundColor: form.isCritical
                        ? "var(--color-stop)"
                        : "transparent",
                    }}
                  >
                    {form.isCritical ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        className="size-3"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : null}
                  </span>
                  <span
                    className="text-m-body font-semibold"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    Critical path
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-3 -mb-3 px-3 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}

/**
 * MobileWbsDeleteConfirm — confirmation modal for deleting a WBS node.
 */
export function MobileWbsDeleteConfirm({
  open,
  onClose,
  nodeId,
  nodeName,
}: {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeName: string;
}) {
  const router = useRouter();
  const deleteAction = useOptimisticAction({
    endpoint: `/api/wbs/nodes/${nodeId}`,
    method: "DELETE",
    successMessage: "WBS node deleted",
    hapticOnSuccess: 30,
    onSuccess: () => {
      onClose();
      router.push("/m/construction?tab=wbs");
      router.refresh();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center "
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-[0.75rem] border p-5 shadow-xl"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="grid place-items-center size-10 rounded-full shrink-0"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-stop) 12%, transparent)",
            }}
          >
            <AlertTriangle
              className="size-5"
              style={{ color: "var(--color-stop)" }}
            />
          </div>
          <div>
            <h3
              className="text-m-section font-extrabold tracking-tight"
              style={{ color: "var(--color-ink-950)" }}
            >
              Delete this WBS node?
            </h3>
            <p
              className="text-m-body mt-1"
              style={{ color: "var(--color-ink-500)" }}
            >
              &quot;{nodeName}&quot; and all its sub-nodes will be permanently
              removed. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onClose}
            disabled={deleteAction.isPending}
            className="flex-1 h-10 rounded-[0.5rem] border font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{
              borderColor: "var(--color-line)",
              color: "var(--color-ink-700)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => deleteAction.execute()}
            disabled={deleteAction.isPending}
            className="flex-1 h-10 rounded-[0.5rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-stop)",
              color: "var(--color-paper)",
            }}
          >
            {deleteAction.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MobileWbsActions — sticky bottom action bar with Edit + Delete buttons
 * for the WBS node detail page. Only shown when canManage is true.
 */
export function MobileWbsActions({
  nodeId,
  nodeName,
  initial,
}: {
  nodeId: string;
  nodeName: string;
  initial: {
    name: string;
    description: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    progressPct: number | string | null;
    isCritical: boolean;
  };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ActionBar>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95"
            style={{
              borderColor: "var(--color-stop)",
              color: "var(--color-stop)",
              backgroundColor: "transparent",
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            <Edit3 className="size-4" />
            Edit
          </button>
        </div>
      </ActionBar>

      <MobileWbsEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        nodeId={nodeId}
        initial={initial}
      />
      <MobileWbsDeleteConfirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        nodeId={nodeId}
        nodeName={nodeName}
      />
    </>
  );
}
