"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
// haptic is a function: haptic(pattern) — use haptic(10) for light, haptic(20) for medium
import { formatCurrency } from "@/lib/utils";

type ChangeOrderType = "ADDITION" | "DELETION" | "MODIFICATION" | "ACCELERATION" | "DECELERATION" | "VARIATION";
type ChangeOrderReason = "CLIENT_REQUEST" | "SITE_CONDITION" | "DESIGN_CHANGE" | "ERROR_OMISSION" | "REGULATORY" | "VALUE_ENGINEERING" | "OTHER";

interface Line {
  description: string;
  originalQty: string;
  revisedQty: string;
  unit: string;
  rate: string;
}

const TYPES: { value: ChangeOrderType; label: string }[] = [
  { value: "ADDITION", label: "Addition" },
  { value: "DELETION", label: "Deletion" },
  { value: "MODIFICATION", label: "Modification" },
  { value: "ACCELERATION", label: "Acceleration" },
  { value: "DECELERATION", label: "Deceleration" },
  { value: "VARIATION", label: "Variation" },
];

const REASONS: { value: ChangeOrderReason; label: string }[] = [
  { value: "CLIENT_REQUEST", label: "Client Request" },
  { value: "SITE_CONDITION", label: "Site Condition" },
  { value: "DESIGN_CHANGE", label: "Design Change" },
  { value: "ERROR_OMISSION", label: "Error / Omission" },
  { value: "REGULATORY", label: "Regulatory" },
  { value: "VALUE_ENGINEERING", label: "Value Engineering" },
  { value: "OTHER", label: "Other" },
];

export function MobileNewChangeOrderDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    type: "MODIFICATION" as ChangeOrderType,
    reason: "OTHER" as ChangeOrderReason,
    scheduleDeltaDays: "0",
    initiatedBy: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([
    { description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" },
  ]);

  useEffect(() => {
    if (open) {
      setForm({
        projectId: projects[0]?.id ?? "",
        title: "",
        description: "",
        type: "MODIFICATION",
        reason: "OTHER",
        scheduleDeltaDays: "0",
        initiatedBy: "",
        notes: "",
      });
      setLines([{ description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" }]);
    }
  }, [open, projects]);

  // Compute live cost delta
  const costDelta = lines.reduce((sum, l) => {
    const oq = parseFloat(l.originalQty) || 0;
    const rq = parseFloat(l.revisedQty) || 0;
    const rate = parseFloat(l.rate) || 0;
    return sum + (rq - oq) * rate;
  }, 0);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    haptic(10);
    setLines((prev) => [...prev, { description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" }]);
  }

  function removeLine(i: number) {
    haptic(10);
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    if (!form.projectId) {
      toast.error("Select a project");
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    if (lines.length === 0) {
      toast.error("At least one line item is required");
      return;
    }
    for (const l of lines) {
      if (!l.description.trim() || !l.unit.trim()) {
        toast.error("Each line needs a description and unit");
        return;
      }
    }

    setSaving(true);
    haptic(20);
    try {
      const res = await fetch("/api/change-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          reason: form.reason,
          scheduleDeltaDays: parseInt(form.scheduleDeltaDays) || 0,
          initiatedBy: form.initiatedBy || null,
          notes: form.notes || null,
          lines: lines.map((l) => ({
            description: l.description.trim(),
            originalQty: parseFloat(l.originalQty) || 0,
            revisedQty: parseFloat(l.revisedQty) || 0,
            unit: l.unit.trim(),
            rate: parseFloat(l.rate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("Change order created");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="mt-auto rounded-t-[1rem] max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4" style={{ color: "var(--color-ink-950)" }} />
            <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>New Change Order</h2>
          </div>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Project */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Project</label>
            <select
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Additional waterproofing for basement"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Detailed description of the change…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Type + Reason */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Type</label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as ChangeOrderType)}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Reason</label>
              <select
                value={form.reason}
                onChange={(e) => set("reason", e.target.value as ChangeOrderReason)}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Schedule delta + Initiated by */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Schedule Δ (days)</label>
              <input
                type="number"
                value={form.scheduleDeltaDays}
                onChange={(e) => set("scheduleDeltaDays", e.target.value)}
                placeholder="0"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Initiated By</label>
              <input
                value={form.initiatedBy}
                onChange={(e) => set("initiatedBy", e.target.value)}
                placeholder="Client / Architect / …"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.625rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Line Items</label>
              <button onClick={addLine} className="press flex items-center gap-1 text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                <Plus className="size-3" /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-[0.5rem] border p-2 space-y-1.5" style={{ borderColor: "var(--color-line)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-500)" }}>Line {i + 1}</span>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)} className="press">
                        <Trash2 className="size-3" style={{ color: "var(--color-stop)" }} />
                      </button>
                    )}
                  </div>
                  <input
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    placeholder="Description"
                    className="w-full h-8 rounded-[0.375rem] border px-2 text-[0.625rem]"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                  <div className="grid grid-cols-4 gap-1">
                    <input
                      type="number"
                      value={l.originalQty}
                      onChange={(e) => updateLine(i, { originalQty: e.target.value })}
                      placeholder="Old Qty"
                      className="h-8 rounded-[0.375rem] border px-1.5 text-[0.625rem] tabular-nums"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                    />
                    <input
                      type="number"
                      value={l.revisedQty}
                      onChange={(e) => updateLine(i, { revisedQty: e.target.value })}
                      placeholder="New Qty"
                      className="h-8 rounded-[0.375rem] border px-1.5 text-[0.625rem] tabular-nums"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                    />
                    <input
                      value={l.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                      placeholder="Unit"
                      className="h-8 rounded-[0.375rem] border px-1.5 text-[0.625rem]"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                    />
                    <input
                      type="number"
                      value={l.rate}
                      onChange={(e) => updateLine(i, { rate: e.target.value })}
                      placeholder="Rate"
                      className="h-8 rounded-[0.375rem] border px-1.5 text-[0.625rem] tabular-nums"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost delta summary */}
          <div
            className="rounded-[0.5rem] p-3 flex items-center justify-between"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <span className="text-[0.625rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cost Delta</span>
            <span
              className="text-[0.875rem] font-bold tabular-nums"
              style={{ color: costDelta > 0 ? "var(--color-stop)" : costDelta < 0 ? "var(--color-go)" : "var(--color-ink-950)" }}
            >
              {costDelta > 0 ? "+" : ""}{formatCurrency(costDelta)}
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Additional notes…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
