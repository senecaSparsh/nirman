"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {Loader2} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type ProjectType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "WAREHOUSE"
  | "MALL"
  | "LAND"
  | "OTHER";
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
  lciThreshold: number | null;
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
  lciThreshold: string;
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
    startDate: project.startDate ? (project.startDate.split("T")[0] ?? "") : "",
    endDate: project.endDate ? (project.endDate.split("T")[0] ?? "") : "",
    totalBudget: project.totalBudget?.toString() ?? "",
    totalSellableArea: project.totalSellableArea?.toString() ?? "",
    description: project.description ?? "",
    reraNumber: project.reraNumber ?? "",
    reraRegistrationDate: project.reraRegistrationDate
      ? (project.reraRegistrationDate.split("T")[0] ?? "")
      : "",
    reraValidityDate: project.reraValidityDate
      ? (project.reraValidityDate.split("T")[0] ?? "")
      : "",
    reraWebsiteUrl: project.reraWebsiteUrl ?? "",
    lciThreshold: project.lciThreshold?.toString() ?? "",
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
          totalBudget:
            form.totalBudget === "" ? null : Number(form.totalBudget),
          totalSellableArea:
            form.totalSellableArea === ""
              ? null
              : Number(form.totalSellableArea),
          description: form.description.trim() || null,
          reraNumber: form.reraNumber.trim() || null,
          reraRegistrationDate: form.reraRegistrationDate || null,
          reraValidityDate: form.reraValidityDate || null,
          reraWebsiteUrl: form.reraWebsiteUrl.trim() || null,
          lciThreshold:
            form.lciThreshold === "" ? null : Number(form.lciThreshold),
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
    <MobileDialog open={open} onClose={onClose} title="Edit Project">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* ── Project Details ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Project Details
            </p>

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
                <EnumSelect
                  label="Type"
                  value={form.type}
                  onChange={(v) => set("type", v as ProjectType)}
                  options={(Object.keys(TYPE_LABELS) as ProjectType[]).map((t) => ({
                    value: t,
                    label: TYPE_LABELS[t],
                  }))}
                />
              </div>
              <div>
                <EnumSelect
                  label="Status"
                  value={form.status}
                  onChange={(v) => set("status", v as ProjectStatus)}
                  options={(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => ({
                    value: s,
                    label: STATUS_LABELS[s],
                  }))}
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Address
              </label>
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
                <label className={labelClass} style={labelStyle}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  End Date
                </label>
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
                <label className={labelClass} style={labelStyle}>
                  Budget (₹)
                </label>
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
                <label className={labelClass} style={labelStyle}>
                  Sellable Area (sq.ft)
                </label>
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
              <label className={labelClass} style={labelStyle}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={1}
                placeholder="Optional notes"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── RERA Registration ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <div>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                RERA Registration
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Mandatory for projects &gt; 500 sqm or &gt; 8 units.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>
                  RERA Number
                </label>
                <input
                  type="text"
                  value={form.reraNumber}
                  onChange={(e) => set("reraNumber", e.target.value)}
                  placeholder="e.g. P1234567890"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Reg. Date
                </label>
                <input
                  type="date"
                  value={form.reraRegistrationDate}
                  onChange={(e) => set("reraRegistrationDate", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>
                  Validity Date
                </label>
                <input
                  type="date"
                  value={form.reraValidityDate}
                  onChange={(e) => set("reraValidityDate", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  RERA URL
                </label>
                <input
                  type="text"
                  value={form.reraWebsiteUrl}
                  onChange={(e) => set("reraWebsiteUrl", e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* ── Procurement ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Procurement
            </p>
            <div>
              <label className={labelClass} style={labelStyle}>
                LCI Threshold % (optional)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={form.lciThreshold}
                onChange={(e) => set("lciThreshold", e.target.value)}
                placeholder="Company default"
                className={inputClass}
                style={inputStyle}
              />
              <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
                Per-project override for the Logistics Complexity Index threshold that routes procurement between central and direct.
              </p>
            </div>
          </div>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="px-3.5 py-2 flex items-center justify-end gap-3">
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
