"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Building2, FileText, ShieldCheck } from "lucide-react";
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
  // ATS (Agreement to Sell)
  isATS: boolean;
  atsRegistrationAmount: string;
  atsExpectedRegistryDate: string;
  // Registry number — captured when ATS = No (registry is done)
  registryNo: string;
  // ── RERA registration ──
  reraNumber: string;
  reraRegistrationDate: string;
  reraValidityDate: string;
  reraWebsiteUrl: string;
}

/** Pre-fill props — numeric fields accept number | string for convenience. */
interface ProjectInitial {
  name?: string;
  type?: ProjectType;
  status?: ProjectStatus;
  address?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: number | string;
  totalSellableArea?: number | string;
  description?: string;
}

/**
 * MobileNewProjectDialog — bottom-sheet style form for creating a project
 * from the mobile surface. Mirrors the desktop ProjectFormDialog's API
 * contract (POST /api/projects with the same body shape) but uses the
 * warm mobile v2 primitives and touch-sized inputs.
 */
export function MobileNewProjectDialog({
  open,
  onClose,
  onCreated,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: { id: string; name: string }) => void;
  initial?: ProjectInitial;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    type: "RESIDENTIAL",
    status: "PLANNED",
    address: "",
    startDate: "",
    endDate: "",
    totalBudget: "",
    totalSellableArea: "",
    description: "",
    isATS: false,
    atsRegistrationAmount: "",
    atsExpectedRegistryDate: "",
    registryNo: "",
    reraNumber: "",
    reraRegistrationDate: "",
    reraValidityDate: "",
    reraWebsiteUrl: "",
  });

  // Apply initial pre-fill values when dialog opens
  useEffect(() => {
    if (open && initial) {
      setForm((f) => ({
        ...f,
        type: initial.type ?? f.type,
        status: initial.status ?? f.status,
        address: initial.address ?? f.address,
        totalSellableArea: initial.totalSellableArea != null ? String(initial.totalSellableArea) : f.totalSellableArea,
        totalBudget: initial.totalBudget != null ? String(initial.totalBudget) : f.totalBudget,
        description: initial.description ?? f.description,
      }));
    }
  }, [open, initial]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
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
          // ATS + registry fields — auto-creates legal docs on the server
          isATS: form.isATS,
          atsRegistrationAmount: form.isATS && form.atsRegistrationAmount ? Number(form.atsRegistrationAmount) : null,
          atsExpectedRegistryDate: form.isATS && form.atsExpectedRegistryDate ? form.atsExpectedRegistryDate : null,
          registryNo: !form.isATS && form.registryNo.trim() ? form.registryNo.trim() : null,
          // RERA registration
          reraNumber: form.reraNumber.trim() || null,
          reraRegistrationDate: form.reraRegistrationDate || null,
          reraValidityDate: form.reraValidityDate || null,
          reraWebsiteUrl: form.reraWebsiteUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create project");
      haptic([10, 40, 80]);
      toast.success("Project created", {
        description: "Add built units to start tracking inventory.",
      });
      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) router.refresh();
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
              <Building2 className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Project
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

        <div className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Project Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              placeholder="e.g. Apex Center — Tower One"
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
              className={`w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none`}
              style={inputStyle}
            />
          </div>

          {/* RERA Registration */}
          <div className="rounded-[0.5rem] border p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-start gap-2">
              <ShieldCheck className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-ink-500)" }} />
              <div>
                <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>RERA Registration</div>
                <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  Mandatory for projects &gt; 500 sqm or &gt; 8 units. Required before marketing/selling.
                </div>
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

          {/* ATS — Agreement to Sell */}
          <div className="rounded-[0.5rem] border p-3 space-y-2.5" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-start gap-2">
              <FileText className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-ink-500)" }} />
              <div>
                <div className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Agreement to Sell (ATS)</div>
                <div className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  Registry not possible yet? Record an ATS — amount paid now, registry deferred.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { set("isATS", false); haptic(10); }}
                className="h-9 rounded-[0.375rem] border-2 text-[0.5625rem] font-bold press"
                style={{
                  borderColor: !form.isATS ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: !form.isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: !form.isATS ? "#fff" : "var(--color-ink-500)",
                }}>
                No ATS
              </button>
              <button type="button" onClick={() => { set("isATS", true); haptic(10); }}
                className="h-9 rounded-[0.375rem] border-2 text-[0.5625rem] font-bold press"
                style={{
                  borderColor: form.isATS ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: form.isATS ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: form.isATS ? "#fff" : "var(--color-ink-500)",
                }}>
                Yes, ATS
              </button>
            </div>
            {form.isATS && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className={labelClass} style={labelStyle}>Reg. Amount (₹)</label>
                  <input type="number" min={0} value={form.atsRegistrationAmount}
                    onChange={(e) => set("atsRegistrationAmount", e.target.value)}
                    placeholder="e.g. 500000" inputMode="numeric"
                    className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Expected Registry</label>
                  <input type="date" value={form.atsExpectedRegistryDate}
                    onChange={(e) => set("atsExpectedRegistryDate", e.target.value)}
                    className={inputClass} style={inputStyle} />
                </div>
              </div>
            )}
            {!form.isATS && (
              <div className="pt-1">
                <label className={labelClass} style={labelStyle}>Registry / Sale Deed No.</label>
                <input type="text" value={form.registryNo}
                  onChange={(e) => set("registryNo", e.target.value)}
                  placeholder="e.g. SR-1234/2025"
                  className={inputClass} style={inputStyle} />
                <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  Sale deed / registry number for the land.
                </p>
              </div>
            )}
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
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
