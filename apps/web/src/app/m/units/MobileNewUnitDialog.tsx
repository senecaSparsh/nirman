"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Home, Sparkles, Layers } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

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

type AreaUnit =
  | "SQFT"
  | "SQM"
  | "SQYD"
  | "ACRE"
  | "BIGHA"
  | "KATHA"
  | "HECTARE";

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
  // RERA fields (optional)
  carpetArea: string;
  superBuiltUpArea: string;
  balconyArea: string;
  clearHeight: string;
  hasLoadingDock: boolean;
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
  // "single" = create one unit; "bulk" = generate many identical units with auto-numbering
  const [mode, setMode] = useState<"single" | "bulk">("single");
  // Bulk generator fields
  const [genPrefix, setGenPrefix] = useState("SHOP-");
  const [genStart, setGenStart] = useState("1");
  const [genCount, setGenCount] = useState("10");
  const [genUnitsPerFloor, setGenUnitsPerFloor] = useState("0");
  const [form, setForm] = useState<FormState>({
    projectId: defaultProjectId ?? "",
    unitType: "BHK_2",
    unitNumber: "",
    floor: "",
    wing: "",
    area: "",
    areaUnit: "SQFT",
    askingPrice: "",
    // RERA fields
    carpetArea: "",
    superBuiltUpArea: "",
    balconyArea: "",
    clearHeight: "",
    hasLoadingDock: false,
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-flow: when area changes, mirror it into superBuiltUpArea
      // if the user hasn't explicitly set a different value. This matches
      // the client's request: "ये जो एरिया है, ये सुपर बिल्ड अप में आ जाए अपने आप"
      if (key === "area" && !f.superBuiltUpArea && typeof value === "string") {
        next.superBuiltUpArea = value;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) {
      toast.error("Project is required");
      return;
    }
    if (!form.area || Number(form.area) <= 0) {
      toast.error("Area must be greater than 0");
      return;
    }

    // ── Build the units array ──
    let units: Array<Record<string, unknown>>;

    if (mode === "bulk") {
      const start = parseInt(genStart) || 1;
      const count = parseInt(genCount) || 1;
      const perFloor = parseInt(genUnitsPerFloor) || 0;
      if (count <= 0 || count > 200) {
        toast.error("Count must be between 1 and 200");
        return;
      }
      units = [];
      for (let i = 0; i < count; i++) {
        const num = start + i;
        const unitNumber = `${genPrefix}${num}`;
        const floor = perFloor > 0 ? Math.floor(i / perFloor) + 1 : null;
        units.push({
          projectId: form.projectId,
          unitType: form.unitType,
          unitNumber,
          floor,
          wing: form.wing.trim() || null,
          area: Number(form.area),
          areaUnit: form.areaUnit,
          askingPrice: form.askingPrice === "" ? null : Number(form.askingPrice),
          carpetArea: form.carpetArea === "" ? null : Number(form.carpetArea),
          superBuiltUpArea: form.superBuiltUpArea === "" ? null : Number(form.superBuiltUpArea),
          balconyArea: form.balconyArea === "" ? null : Number(form.balconyArea),
          clearHeight: form.clearHeight === "" ? null : Number(form.clearHeight),
          hasLoadingDock: form.hasLoadingDock,
        });
      }
    } else {
      if (!form.unitNumber.trim()) {
        toast.error("Unit number is required");
        return;
      }
      units = [
        {
          projectId: form.projectId,
          unitType: form.unitType,
          unitNumber: form.unitNumber.trim(),
          floor: form.floor === "" ? null : Number(form.floor),
          wing: form.wing.trim() || null,
          area: Number(form.area),
          areaUnit: form.areaUnit,
          askingPrice: form.askingPrice === "" ? null : Number(form.askingPrice),
          carpetArea: form.carpetArea === "" ? null : Number(form.carpetArea),
          superBuiltUpArea: form.superBuiltUpArea === "" ? null : Number(form.superBuiltUpArea),
          balconyArea: form.balconyArea === "" ? null : Number(form.balconyArea),
          clearHeight: form.clearHeight === "" ? null : Number(form.clearHeight),
          hasLoadingDock: form.hasLoadingDock,
        },
      ];
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/built-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(units),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create unit(s)");
      haptic([10, 40, 80]);
      toast.success(
        units.length === 1
          ? "Unit created"
          : `${units.length} units created`,
      );
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

  const inputClass =
    "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
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
              <Home
                className="size-3.5"
                style={{ color: "var(--color-ink-600)" }}
              />
            </span>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              {mode === "bulk" ? "Generate Units" : "New Built Unit"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch grid place-items-center rounded-[0.375rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Mode toggle — Single vs Generate Multiple */}
        <div
          className="grid grid-cols-2 gap-1 rounded-[0.5rem] p-1 mb-1"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <button
            type="button"
            onClick={() => setMode("single")}
            className="flex items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-label font-bold transition-colors press"
            style={{
              backgroundColor: mode === "single" ? "var(--color-paper)" : "transparent",
              color: mode === "single" ? "var(--color-ink-950)" : "var(--color-ink-500)",
            }}
          >
            <Home className="size-3" /> Single
          </button>
          <button
            type="button"
            onClick={() => setMode("bulk")}
            className="flex items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-label font-bold transition-colors press"
            style={{
              backgroundColor: mode === "bulk" ? "var(--color-paper)" : "transparent",
              color: mode === "bulk" ? "var(--color-ink-950)" : "var(--color-ink-500)",
            }}
          >
            <Layers className="size-3" /> Generate Multiple
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Project */}
          <MobileSelectWithCreate
            label="Project"
            required
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            placeholder="— Select project —"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            inputClass={inputClass}
            inputStyle={inputStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewProjectDialog
                open={open}
                onClose={onClose}
                onCreated={(p) => onCreated(p.id, p.name)}
              />
            )}
          />

          {/* ── Bulk mode: generator fields ── */}
          {mode === "bulk" ? (
            <>
              {/* Unit Type (full width in bulk mode) */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Unit Type
                </label>
                <select
                  value={form.unitType}
                  onChange={(e) => set("unitType", e.target.value as UnitType)}
                  className={inputClass}
                  style={inputStyle}
                >
                  {(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => (
                    <option key={t} value={t}>
                      {UNIT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prefix + Start No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Number Prefix
                  </label>
                  <input
                    type="text"
                    value={genPrefix}
                    onChange={(e) => setGenPrefix(e.target.value)}
                    placeholder="SHOP-"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Start No.
                  </label>
                  <input
                    type="number"
                    value={genStart}
                    onChange={(e) => setGenStart(e.target.value)}
                    placeholder="1"
                    inputMode="numeric"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Count + Units per floor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Count <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    placeholder="10"
                    inputMode="numeric"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Units / Floor
                  </label>
                  <input
                    type="number"
                    value={genUnitsPerFloor}
                    onChange={(e) => setGenUnitsPerFloor(e.target.value)}
                    placeholder="0 = no auto-floor"
                    inputMode="numeric"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Preview */}
              <div
                className="rounded-[0.5rem] p-2 text-m-caption"
                style={{
                  backgroundColor: "var(--color-concrete)",
                  color: "var(--color-ink-600)",
                }}
              >
                <Sparkles className="inline size-3 mr-1" style={{ color: "var(--color-signal)" }} />
                Preview:{" "}
                <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {genPrefix}{genStart || "1"}
                  {" – "}
                  {genPrefix}{(parseInt(genStart) || 1) + (parseInt(genCount) || 1) - 1}
                </span>
                {"  "}({parseInt(genCount) || 0} units)
              </div>
            </>
          ) : (
            <>
          {/* Unit Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Unit Number{" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
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
              <label className={labelClass} style={labelStyle}>
                Type
              </label>
              <select
                value={form.unitType}
                onChange={(e) => set("unitType", e.target.value as UnitType)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => (
                  <option key={t} value={t}>
                    {UNIT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Floor + Wing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Floor
              </label>
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
              <label className={labelClass} style={labelStyle}>
                Wing / Section
              </label>
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
              <label className={labelClass} style={labelStyle}>
                Unit
              </label>
              <select
                value={form.areaUnit}
                onChange={(e) => set("areaUnit", e.target.value as AreaUnit)}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {AREA_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Asking Price */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Asking Price (₹)
            </label>
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

          {/* RERA areas (optional) */}
          <div
            className="rounded-[0.5rem] border p-2.5 space-y-2.5"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper-2)",
            }}
          >
            <p
              className="text-m-caption font-bold uppercase"
              style={{ color: "var(--color-ink-500)" }}
            >
              RERA Areas (optional)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>
                  Carpet Area
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.carpetArea}
                  onChange={(e) => set("carpetArea", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Super Built-Up
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.superBuiltUpArea}
                  onChange={(e) => set("superBuiltUpArea", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>
                  Balcony Area
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.balconyArea}
                  onChange={(e) => set("balconyArea", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Clear Height
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.clearHeight}
                  onChange={(e) => set("clearHeight", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
            <label
              className="flex items-center gap-2 text-m-caption font-semibold"
              style={{ color: "var(--color-ink-700)" }}
            >
              <input
                type="checkbox"
                checked={form.hasLoadingDock}
                onChange={(e) => set("hasLoadingDock", e.target.checked)}
                className="size-3.5"
              />
              Has Loading Dock
            </label>
          </div>
            </>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
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
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving
                ? "Creating…"
                : mode === "bulk"
                  ? `Generate ${parseInt(genCount) || 0} Units`
                  : "Create Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
