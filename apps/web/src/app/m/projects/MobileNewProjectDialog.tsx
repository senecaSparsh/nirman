"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

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
  lciThreshold: string;
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
 * MobileNewProjectDialog — form body for creating a project from the
 * mobile surface. Mirrors the desktop ProjectFormDialog's API contract
 * (POST /api/projects with the same body shape) but uses the warm
 * mobile v2 primitives and touch-sized inputs.
 *
 * This component renders only the form content — the backdrop, sheet
 * wrapper, title, and drag handle are provided by MobileFabModal.
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
  const [showRera, setShowRera] = useState(false);
  const [showAts, setShowAts] = useState(false);
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
    lciThreshold: "",
  });

  // Apply initial pre-fill values when dialog opens
  useEffect(() => {
    if (open && initial) {
      setForm((f) => ({
        ...f,
        type: initial.type ?? f.type,
        status: initial.status ?? f.status,
        address: initial.address ?? f.address,
        totalSellableArea:
          initial.totalSellableArea != null
            ? String(initial.totalSellableArea)
            : f.totalSellableArea,
        totalBudget:
          initial.totalBudget != null
            ? String(initial.totalBudget)
            : f.totalBudget,
        description: initial.description ?? f.description,
      }));
    }
  }, [open, initial]);

  // Auto-expand RERA/ATS sections if they already have data
  useEffect(() => {
    if (open) {
      if (form.reraNumber || form.reraRegistrationDate || form.reraValidityDate || form.reraWebsiteUrl) {
        setShowRera(true);
      }
      if (form.isATS || form.registryNo || form.atsRegistrationAmount) {
        setShowAts(true);
      }
    }
  }, [open]);

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
          totalBudget:
            form.totalBudget === "" ? null : Number(form.totalBudget),
          totalSellableArea:
            form.totalSellableArea === ""
              ? null
              : Number(form.totalSellableArea),
          description: form.description.trim() || null,
          // ATS + registry fields — auto-creates legal docs on the server
          isATS: form.isATS,
          atsRegistrationAmount:
            form.isATS && form.atsRegistrationAmount
              ? Number(form.atsRegistrationAmount)
              : null,
          atsExpectedRegistryDate:
            form.isATS && form.atsExpectedRegistryDate
              ? form.atsExpectedRegistryDate
              : null,
          registryNo:
            !form.isATS && form.registryNo.trim()
              ? form.registryNo.trim()
              : null,
          // RERA registration
          reraNumber: form.reraNumber.trim() || null,
          reraRegistrationDate: form.reraRegistrationDate || null,
          reraValidityDate: form.reraValidityDate || null,
          reraWebsiteUrl: form.reraWebsiteUrl.trim() || null,
          lciThreshold:
            form.lciThreshold === "" ? null : Number(form.lciThreshold),
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
    <div className="space-y-3">
      {/* ── Main fields — one big border box ── */}
      <div
        className="rounded-[0.625rem] border p-3 space-y-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Project Details
          </p>

          {/* Name + Type (Name takes 2/3, Type 1/3) */}
          <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div className="col-span-2">
              <label className={labelClass} style={labelStyle}>
                Project Name <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="e.g. Apex Center — Tower One"
                autoFocus
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as ProjectType)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(TYPE_LABELS) as ProjectType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status + LCI Threshold (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProjectStatus)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                LCI % <span className="font-normal" style={{ color: "var(--color-ink-400)" }}>opt.</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={form.lciThreshold}
                onChange={(e) => set("lciThreshold", e.target.value)}
                placeholder="Default"
                inputMode="decimal"
                className={inputClass}
                style={inputStyle}
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

          {/* Start + End Date (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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

          {/* Budget + Sellable Area (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
          <div className="">
            <label className={labelClass} style={labelStyle}>
              Description <span className="font-normal" style={{ color: "var(--color-ink-400)" }}>opt.</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className={`w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors`}
              style={inputStyle}
            />
          </div>
      </div>

      {/* ── RERA Registration — collapsible ── */}
      <div
        className="rounded-[0.625rem] border p-3 space-y-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
          <button
            type="button"
            onClick={() => { setShowRera((v) => !v); haptic(10); }}
            className="flex items-center gap-1.5 w-full text-left press"
            style={{
              backgroundColor: "transparent",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                RERA Registration
              </div>
              <div className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {form.reraNumber ? `№ ${form.reraNumber}` : "Mandatory for >500 sqm or >8 units"}
              </div>
            </div>
            {showRera ? <ChevronDown className="size-4 shrink-0" style={{ color: "var(--color-ink-700)" }} /> : <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-700)" }} />}
          </button>
          {showRera && (
            <div className="space-y-3 ">
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
          )}
      </div>

      {/* ── ATS — Agreement to Sell — collapsible ── */}
      <div
        className="rounded-[0.625rem] border p-3 space-y-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
          <button
            type="button"
            onClick={() => { setShowAts((v) => !v); haptic(10); }}
            className="flex items-center gap-1.5 w-full text-left press"
            style={{
              backgroundColor: "transparent",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Agreement to Sell (ATS)
              </div>
              <div className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {form.isATS ? "ATS — registry deferred" : form.registryNo ? `Deed № ${form.registryNo}` : "Registry not done? Record an ATS"}
              </div>
            </div>
            {showAts ? <ChevronDown className="size-4 shrink-0" style={{ color: "var(--color-ink-700)" }} /> : <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-700)" }} />}
          </button>
          {showAts && (
            <div className="space-y-3 ">
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <button
                  type="button"
                  onClick={() => {
                    set("isATS", false);
                    haptic(10);
                  }}
                  className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor: !form.isATS
                      ? "var(--color-ink-950)"
                      : "var(--color-line)",
                    backgroundColor: !form.isATS
                      ? "var(--color-ink-950)"
                      : "var(--color-paper)",
                    color: !form.isATS
                      ? "var(--color-paper)"
                      : "var(--color-ink-500)",
                  }}
                >
                  No ATS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    set("isATS", true);
                    haptic(10);
                  }}
                  className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor: form.isATS
                      ? "var(--color-ink-950)"
                      : "var(--color-line)",
                    backgroundColor: form.isATS
                      ? "var(--color-ink-950)"
                      : "var(--color-paper)",
                    color: form.isATS
                      ? "var(--color-paper)"
                      : "var(--color-ink-500)",
                  }}
                >
                  Yes, ATS
                </button>
              </div>
              {form.isATS && (
                <div className="grid grid-cols-2 gap-1 pt-0.5">
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Reg. Amount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.atsRegistrationAmount}
                      onChange={(e) =>
                        set("atsRegistrationAmount", e.target.value)
                      }
                      placeholder="e.g. 500000"
                      inputMode="numeric"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Expected Registry
                    </label>
                    <input
                      type="date"
                      value={form.atsExpectedRegistryDate}
                      onChange={(e) =>
                        set("atsExpectedRegistryDate", e.target.value)
                      }
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
              {!form.isATS && (
                <div className="pt-0.5">
                  <label className={labelClass} style={labelStyle}>
                    Registry / Sale Deed No.
                  </label>
                  <input
                    type="text"
                    value={form.registryNo}
                    onChange={(e) => set("registryNo", e.target.value)}
                    placeholder="e.g. SR-1234/2025"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          )}
      </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 ">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-700)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </div>
  );
}
