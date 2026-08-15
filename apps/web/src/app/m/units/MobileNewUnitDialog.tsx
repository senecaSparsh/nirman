"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Home } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type UnitType =
  | "BHK_1"
  | "BHK_2"
  | "BHK_3"
  | "BHK_4"
  | "SHOP"
  | "OFFICE"
  | "WAREHOUSE_UNIT"
  | "VILLA"
  | "OTHER";

type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  BHK_1: "1 BHK",
  BHK_2: "2 BHK",
  BHK_3: "3 BHK",
  BHK_4: "4 BHK",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE_UNIT: "Warehouse Unit",
  VILLA: "Villa",
  OTHER: "Other",
};

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  SQFT: "sq.ft",
  SQM: "sq.m",
  SQYD: "sq.yd",
  ACRE: "acre",
  BIGHA: "bigha",
  KATHA: "katha",
  HECTARE: "hectare",
};

interface ProjectOption {
  id: string;
  name: string;
}

interface FormState {
  projectId: string;
  unitType: UnitType;
  unitNumber: string;
  floor: string;
  wing: string;
  area: string;
  areaUnit: AreaUnit;
  askingPrice: string;
}

/**
 * MobileNewUnitDialog — bottom-sheet form for creating a single built unit.
 * Mirrors the desktop built-unit-form-dialog's API contract
 * (POST /api/built-units with an array body — we send a single-item array).
 */
export function MobileNewUnitDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    projectId: defaultProjectId ?? "",
    unitType: "BHK_2",
    unitNumber: "",
    floor: "",
    wing: "",
    area: "",
    areaUnit: "SQFT",
    askingPrice: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) {
      toast.error("Project is required");
      return;
    }
    if (!form.unitNumber.trim()) {
      toast.error("Unit number is required");
      return;
    }
    if (!form.area || Number(form.area) <= 0) {
      toast.error("Area must be greater than 0");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/built-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            projectId: form.projectId,
            unitType: form.unitType,
            unitNumber: form.unitNumber.trim(),
            floor: form.floor === "" ? null : Number(form.floor),
            wing: form.wing.trim() || null,
            area: Number(form.area),
            areaUnit: form.areaUnit,
            askingPrice: form.askingPrice === "" ? null : Number(form.askingPrice),
          },
        ]),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create unit");
      haptic([10, 40, 80]);
      toast.success("Unit created");
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
              <Home className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Built Unit
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
          {/* Project */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Project <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Unit Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Unit Number <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.unitNumber}
                onChange={(e) => set("unitNumber", e.target.value)}
                placeholder="e.g. A-101"
                autoFocus
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Type</label>
              <select
                value={form.unitType}
                onChange={(e) => set("unitType", e.target.value as UnitType)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => (
                  <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Floor + Wing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Floor</label>
              <input
                type="number"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
                placeholder="e.g. 1"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Wing / Section</label>
              <input
                type="text"
                value={form.wing}
                onChange={(e) => set("wing", e.target.value)}
                placeholder="e.g. A"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Area + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Area <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Unit</label>
              <select
                value={form.areaUnit}
                onChange={(e) => set("areaUnit", e.target.value as AreaUnit)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => (
                  <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Asking Price */}
          <div>
            <label className={labelClass} style={labelStyle}>Asking Price (₹)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.askingPrice}
              onChange={(e) => set("askingPrice", e.target.value)}
              placeholder="0"
              inputMode="numeric"
              enterKeyHint="done"
              className={inputClass}
              style={inputStyle}
            />
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
              {saving ? "Creating…" : "Create Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
