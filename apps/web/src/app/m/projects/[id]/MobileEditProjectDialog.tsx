"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Pencil, Building2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER";
type ProjectStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD";

const TYPE_LABELS: Record<ProjectType, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail",
  LAND: "Land Development",
  OTHER: "Other",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
};

export interface ProjectEditData {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number | null;
  totalSellableArea: number | null;
  description: string | null;
  reraNumber: string | null;
  reraRegistrationDate: string | null;
  reraValidityDate: string | null;
  reraWebsiteUrl: string | null;
}

interface FormState {
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  address: string;
  startDate: string;
  endDate: string;
  totalBudget: string;
  totalSellableArea: string;
  description: string;
  reraNumber: string;
  reraRegistrationDate: string;
  reraValidityDate: string;
  reraWebsiteUrl: string;
}

/**
 * MobileEditProjectDialog — bottom-sheet form for editing an existing
 * project from the mobile project detail page. Submits PATCH /api/projects/[id].
 */
export function MobileEditProjectDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectEditData;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: project.name,
    type: project.type,
    status: project.status,
    address: project.address ?? "",
    startDate: project.startDate ? project.startDate.split("T")[0] ?? "" : "",
    endDate: project.endDate ? project.endDate.split("T")[0] ?? "" : "",
    totalBudget: project.totalBudget?.toString() ?? "",
    totalSellableArea: project.totalSellableArea?.toString() ?? "",
    description: project.description ?? "",
    reraNumber: project.reraNumber ?? "",
    reraRegistrationDate: project.reraRegistrationDate ? project.reraRegistrationDate.split("T")[0] ?? "" : "",
    reraValidityDate: project.reraValidityDate ? project.reraValidityDate.split("T")[0] ?? "" : "",
    reraWebsiteUrl: project.reraWebsiteUrl ?? "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          status: form.status,
          address: form.address.trim() || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          totalBudget: form.totalBudget === "" ? null : Number(form.totalBudget),
          totalSellableArea: form.totalSellableArea === "" ? null : Number(form.totalSellableArea),
          description: form.description.trim() || null,
          reraNumber: form.reraNumber.trim() || null,
          reraRegistrationDate: form.reraRegistrationDate || null,
          reraValidityDate: form.reraValidityDate || null,
          reraWebsiteUrl: form.reraWebsiteUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update project");
      haptic([10, 40, 80]);
      toast.success("Project updated");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <Pencil className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Edit Project
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Project Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Type</label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as ProjectType)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(TYPE_LABELS) as ProjectType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProjectStatus)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelClass} style={labelStyle}>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Plot no, area, city, PIN"
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Budget + Area */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Budget (₹)</label>
              <input
                type="number"
                min={0}
                value={form.totalBudget}
                onChange={(e) => set("totalBudget", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Sellable Area (sq.ft)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.totalSellableArea}
                onChange={(e) => set("totalSellableArea", e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass} style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* RERA Registration */}
          <div className="rounded-[0.5rem] border p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>RERA Registration</div>
              <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                Mandatory for projects &gt; 500 sqm or &gt; 8 units.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>RERA Number</label>
                <input type="text" value={form.reraNumber}
                  onChange={(e) => set("reraNumber", e.target.value)}
                  placeholder="e.g. P1234567890"
                  className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Reg. Date</label>
                <input type="date" value={form.reraRegistrationDate}
                  onChange={(e) => set("reraRegistrationDate", e.target.value)}
                  className={inputClass} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Validity Date</label>
                <input type="date" value={form.reraValidityDate}
                  onChange={(e) => set("reraValidityDate", e.target.value)}
                  className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>RERA URL</label>
                <input type="text" value={form.reraWebsiteUrl}
                  onChange={(e) => set("reraWebsiteUrl", e.target.value)}
                  placeholder="https://..."
                  className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
