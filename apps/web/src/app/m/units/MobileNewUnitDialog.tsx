"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Home, Sparkles, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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
 * MobileNewUnitForm — form content for creating a single built unit.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * units page, or wrapped by <MobileNewUnitDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewMaterialForm / MobileNewLeaveForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewUnitForm({
  onClose,
  projects,
  defaultProjectId,
}: {
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
      {/* Mode toggle — Single vs Generate Multiple */}
      <div
        className="grid grid-cols-2 gap-1 rounded-[0.5rem] p-1"
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

      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Details
        </p>

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
          labelClass={labelClass}
          labelStyle={labelStyle}
          renderDialog={({ open, onClose, onCreated, originRect }) => (
            <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project">
              <MobileNewProjectDialog
                open={open}
                onClose={onClose}
                onCreated={(p) => onCreated(p.id, p.name)}
              />
            </MobileFabModal>
          )}
        />

        {/* ── Bulk mode: generator fields ── */}
        {mode === "bulk" ? (
          <>
            {/* Unit Type (full width in bulk mode) */}
            <EnumSelect
              label="Unit Type"
              value={form.unitType}
              onChange={(v) => set("unitType", v as UnitType)}
              options={(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => ({
                value: t,
                label: UNIT_TYPE_LABELS[t],
              }))}
            />

            {/* Prefix + Start No */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
              <span className="font-bold" style={{ color: "var(--color-ink-500)" }}>
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
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
              <EnumSelect
                label="Type"
                value={form.unitType}
                onChange={(v) => set("unitType", v as UnitType)}
                options={(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => ({
                  value: t,
                  label: UNIT_TYPE_LABELS[t],
                }))}
              />
            </div>

            {/* Floor + Wing */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
              <EnumSelect
                label="Unit"
                value={form.areaUnit}
                onChange={(v) => set("areaUnit", v as AreaUnit)}
                options={(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => ({
                  value: u,
                  label: AREA_UNIT_LABELS[u],
                }))}
              />
            </div>
          </>
        )}
      </div>

      {/* Pricing */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Pricing
        </p>
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
      </div>

      {/* RERA Areas (optional) */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          RERA Areas (optional)
        </p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
          className="flex items-center gap-1 text-m-caption font-semibold"
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

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving
              ? "Creating…"
              : mode === "bulk"
                ? `Generate ${parseInt(genCount) || 0} Units`
                : "Create Unit"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewUnitDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages
 * (e.g. MobileProjectUnitsFab). Prefer wrapping <MobileNewUnitForm>
 * in <MobileFabModal> instead — that gives the spring-from-FAB
 * animation matching the materials and leaves pages.
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Built Unit">
      <MobileNewUnitForm
        onClose={onClose}
        projects={projects}
        defaultProjectId={defaultProjectId}
      />
    </MobileDialog>
  );
}
