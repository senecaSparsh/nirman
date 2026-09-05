"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
// haptic is a function: haptic(pattern) — use haptic(10) for light, haptic(20) for medium
import { formatCurrency } from "@/lib/utils";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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

/**
 * MobileNewChangeOrderForm — form content for creating a change order.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * change-orders page, or wrapped by <MobileNewChangeOrderDialog>
 * (legacy bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewChangeOrderForm({
  onClose,
  projects,
}: {
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
  }, [projects]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Details
        </p>
        <div>
          <label className={labelClass} style={labelStyle}>
            Project
          </label>
          <select
            value={form.projectId}
            onChange={(e) => set("projectId", e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>
            Title
          </label>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Additional waterproofing for basement"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            placeholder="Detailed description of the change…"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <label className={labelClass} style={labelStyle}>
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value as ChangeOrderType)}
              className={inputClass}
              style={inputStyle}
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>
              Reason
            </label>
            <select
              value={form.reason}
              onChange={(e) => set("reason", e.target.value as ChangeOrderReason)}
              className={inputClass}
              style={inputStyle}
            >
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Schedule & Initiation */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Schedule &amp; Initiation
        </p>
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <label className={labelClass} style={labelStyle}>
              Schedule Δ (days)
            </label>
            <input
              type="number"
              value={form.scheduleDeltaDays}
              onChange={(e) => set("scheduleDeltaDays", e.target.value)}
              placeholder="0"
              className={`${inputClass} tabular-nums`}
              style={inputStyle}
            />
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>
              Initiated By
            </label>
            <input
              value={form.initiatedBy}
              onChange={(e) => set("initiatedBy", e.target.value)}
              placeholder="Client / Architect / …"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className={sectionClass} style={sectionStyle}>
        <div className="flex items-center justify-between">
          <p className={sectionTitleClass} style={sectionTitleStyle}>
            Line Items
          </p>
          <button
            type="button"
            onClick={addLine}
            className="text-m-body press flex items-center gap-1 text-m-label font-bold"
            style={{ color: "var(--color-ink-950)" }}
          >
            <Plus className="size-3" /> Add Line
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="rounded-[0.5rem] border p-2 flex flex-col gap-1.5"
              style={{ borderColor: "var(--color-line)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-500)" }}>Line {i + 1}</span>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-m-body press">
                    <Trash2 className="size-3" style={{ color: "var(--color-stop)" }} />
                  </button>
                )}
              </div>
              <input
                value={l.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="Description"
                className="w-full h-8 rounded-[0.375rem] border px-2 text-m-label"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
              <div className="grid grid-cols-4 gap-1">
                <input
                  type="number"
                  value={l.originalQty}
                  onChange={(e) => updateLine(i, { originalQty: e.target.value })}
                  placeholder="Old Qty"
                  className="h-8 rounded-[0.375rem] border px-1.5 text-m-label tabular-nums"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
                <input
                  type="number"
                  value={l.revisedQty}
                  onChange={(e) => updateLine(i, { revisedQty: e.target.value })}
                  placeholder="New Qty"
                  className="h-8 rounded-[0.375rem] border px-1.5 text-m-label tabular-nums"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
                <input
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                  placeholder="Unit"
                  className="h-8 rounded-[0.375rem] border px-1.5 text-m-label"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
                <input
                  type="number"
                  value={l.rate}
                  onChange={(e) => updateLine(i, { rate: e.target.value })}
                  placeholder="Rate"
                  className="h-8 rounded-[0.375rem] border px-1.5 text-m-label tabular-nums"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Cost delta summary */}
        <div
          className="rounded-[0.5rem] p-3 flex items-center justify-between"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <span className="text-m-label font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cost Delta</span>
          <span
            className="text-m-section font-bold tabular-nums"
            style={{ color: costDelta > 0 ? "var(--color-stop)" : costDelta < 0 ? "var(--color-go)" : "var(--color-ink-950)" }}
          >
            {costDelta > 0 ? "+" : ""}{formatCurrency(costDelta)}
          </span>
        </div>
      </div>

      {/* Notes */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Notes
        </p>
        <div>
          <label className={labelClass} style={labelStyle}>
            Notes (optional)
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Additional notes…"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
        }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {saving ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

/**
 * MobileNewChangeOrderDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewChangeOrderForm> in <MobileFabModal>
 * instead — that gives the spring-from-FAB animation matching the
 * materials and leaves pages.
 */
export function MobileNewChangeOrderDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Change Order">
      <MobileNewChangeOrderForm onClose={onClose} projects={projects} />
    </MobileDialog>
  );
}
