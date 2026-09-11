"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";
import { previewMaterialCode } from "@/lib/material-code";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewCategoryDialog } from "@/app/m/materials/new/MobileNewCategoryDialog";
import { MobileStockLocationSelect } from "@/components/mobile/selectors";
import { HsnSacSearch } from "@/components/hsn-sac-search";

// Common construction units — finite set prevents typos like "bags" vs "BAG".
// Category default pre-selects, user can override from this list.
const COMMON_UNITS = [
  "BAG", "KG", "TON", "CUM", "SQFT", "SQM", "RMT", "NOS", "SET", "LTR", "BOX", "ROLL", "SHEET", "PAIR",
] as const;

// GST has exactly 5 standard slabs in India — a selector prevents invalid rates like 18.5%.
const GST_SLABS = [0, 5, 12, 18, 28] as const;

/**
 * Form content for creating a material — used inside MobileFabModal
 * (spring-from-FAB animation) or wrapped by MobileNewMaterialDialog
 * (legacy bottom-sheet backdrop).
 *
 * HSN/GST auto-fill flow:
 *   1. User types material name → debounced call to /api/hsn-gst?suggest=...
 *   2. Top suggestion auto-fills HSN code + GST rate (user can override)
 *   3. If user types a known HSN code → GST rate auto-looks up from master
 */
export function MobileNewMaterialForm({
  onClose,
  onCreated,
  categories,
  showOpeningStock = false,
  locations = [],
}: {
  onClose: () => void;
  onCreated?: (material: {
    id: string;
    name: string;
    code: string;
    unit: string;
    hsnCode: string | null;
    gstRate: number;
    standardCost: number;
  }) => void;
  categories: { id: string; name: string; unit: string; hsnCode?: string | null; gstRate?: number | string | null | { toNumber(): number } }[];
  showOpeningStock?: boolean;
  locations?: { id: string; name: string; projectName?: string | null }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("AUTO");
  const [grade, setGrade] = useState("");
  const [specification, setSpecification] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState(0);
  const [standardCost, setStandardCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  // Opening stock state
  const [openingQty, setOpeningQty] = useState("");
  const [openingUnitCost, setOpeningUnitCost] = useState("");
  const [openingLocationId, setOpeningLocationId] = useState(locations[0]?.id ?? "");
  // Local category list so a freshly created category appears in the dropdown
  // without waiting for router.refresh.
  const [localCategories, setLocalCategories] = useState(categories);

  // When category changes, auto-set unit AND HSN code + GST rate from the
  // category's stored defaults. The user can still override the HSN/GST
  // manually — the HsnSacSearch component's `manuallySet` flag tracks this.
  useEffect(() => {
    if (!categoryId) {
      setUnit("");
      return;
    }
    const cat = localCategories.find((c) => c.id === categoryId);
    if (cat) {
      setUnit(cat.unit);
      // Auto-fill HSN + GST from category defaults (only if the user hasn't
      // manually set them for this material)
      if (cat.hsnCode) {
        setHsnCode(cat.hsnCode);
      }
      if (cat.gstRate != null) {
        const r = cat.gstRate;
        setGstRate(typeof r === "number" ? r : typeof r === "string" ? Number(r) || 0 : r.toNumber());
      }
    }
  }, [categoryId, localCategories]);

  // Instant client-side code preview — no API call needed.
  // Recomputes immediately as category or grade changes.
  const autoCode = useMemo(() => {
    if (code !== "AUTO" || !categoryId) return null;
    const cat = localCategories.find((c) => c.id === categoryId);
    if (!cat) return null;
    return previewMaterialCode(cat.name, grade);
  }, [code, categoryId, localCategories, grade]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) {
      toast.error("Material name is required");
      return;
    }
    if (!categoryId) {
      toast.error("Category is required");
      return;
    }
    if (!unit.trim()) {
      toast.error("Unit is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "AUTO",
          name: name.trim(),
          grade: grade.trim() || null,
          specification: specification.trim() || null,
          categoryId,
          unit: unit.trim().toUpperCase(),
          hsnCode: hsnCode.trim() || null,
          gstRate,
          standardCost: Number(standardCost) || 0,
          reorderPoint: reorderPoint.trim() === "" ? null : Number(reorderPoint),
          description: description.trim() || null,
          // Opening stock — only sent if qty > 0 and a location is selected
          ...(showOpeningStock && openingQty && Number(openingQty) > 0 && openingLocationId
            ? {
                openingStock: {
                  locationId: openingLocationId,
                  qty: Number(openingQty),
                  unitCost: openingUnitCost ? Number(openingUnitCost) : Number(standardCost) || 0,
                  reason: "Opening stock entry",
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create material");
      haptic([10, 40, 80]);
      toast.success(`${data.name} material created`, {
        description: hsnCode ? `HSN ${hsnCode} · GST ${gstRate}%` : undefined,
      });
      router.refresh();
      onCreated?.({
        id: data.id,
        name: data.name,
        code: data.code,
        unit: data.unit,
        hsnCode: data.hsnCode,
        gstRate: Number(data.gstRate),
        standardCost: Number(data.standardCost) || 0,
      });
      // Reset form
      setName("");
      setCode("AUTO");
      setGrade("");
      setSpecification("");
      setCategoryId("");
      setUnit("");
      setHsnCode("");
      setGstRate(0);
      setStandardCost("");
      setReorderPoint("");
      setDescription("");
      setOpeningQty("");
      setOpeningUnitCost("");
      setOpeningLocationId(locations[0]?.id ?? "");
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Details */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Details</p>
        {/* Name + Code (side by side) */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OPC Cement 53"
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Code
            </label>
            {code === "AUTO" ? (
              <div className="flex items-center gap-1.5 rounded-[0.375rem] border px-2 h-7" style={{ borderColor: "var(--color-steel)", backgroundColor: "var(--color-steel-wash)" }}>
                <Sparkles className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
                <span className="text-m-caption font-mono font-bold truncate" style={{ color: "var(--color-steel-dark)" }}>
                  {autoCode || "Auto"}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CEM-OPC53"
                className="w-full h-7 px-1 text-m-caption font-mono uppercase outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            )}
            {code === "AUTO" && (
              <button
                type="button"
                onClick={() => setCode("")}
                className="text-m-caption font-semibold press mt-0.5"
                style={{ color: "var(--color-ink-500)" }}
              >
                Enter manually
              </button>
            )}
          </div>
        </div>

        {/* Grade + Specification (side by side) */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Grade
            </label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. 53"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
          <div className="pl-2">
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Specification
            </label>
            <input
              type="text"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              placeholder="e.g. IS 269"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
        </div>
        </div>

        {/* Classification */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Classification</p>
        {/* Category + Unit (side by side) */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <MobileSelectWithCreate
            label="Category"
            required
            value={categoryId}
            onChange={(v) => {
              setCategoryId(v);
              haptic(10);
            }}
            options={localCategories.map((c) => {
              const gst = c.gstRate;
              const gstNum = gst != null ? (typeof gst === "number" ? gst : typeof gst === "string" ? Number(gst) || 0 : gst.toNumber()) : null;
              return {
                value: c.id,
                label: c.name,
                sub: c.hsnCode ? `HSN ${c.hsnCode}${gstNum != null ? ` · ${gstNum}% GST` : ""}` : undefined,
              };
            })}
            placeholder="Select…"
            stacked
            createLabel="category"
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewCategoryDialog
                open={open}
                onClose={onClose}
                nested
                onCreated={(cat) => {
                  setLocalCategories((prev) => prev.some((x) => x.id === cat.id) ? prev : [...prev, cat]);
                  onCreated(cat.id, cat.name);
                }}
              />
            )}
          />
          <EnumSelect
            label="Unit"
            required
            value={unit}
            onChange={(v) => setUnit(v)}
            placeholder="Select…"
            options={[
              ...COMMON_UNITS.map((u) => ({ value: u, label: u })),
              // Allow custom unit if the category default isn't in the common list
              ...(unit && !COMMON_UNITS.includes(unit as (typeof COMMON_UNITS)[number])
                ? [{ value: unit, label: unit }]
                : []),
            ]}
          />
        </div>
        </div>

        {/* Tax */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Tax</p>
          {/* HSN Code + GST Rate (side by side, symmetric) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            {/* HSN Code — shared HsnSacSearch component with smart auto-detect */}
            <div className="pr-2">
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                HSN Code
              </label>
              <HsnSacSearch
                value={hsnCode}
                onCodeChange={setHsnCode}
                onGstRateChange={(rate) => setGstRate(rate)}
                placeholder="2523"
                materialName={name}
                categoryName={localCategories.find((c) => c.id === categoryId)?.name}
                inputClassName="flex-1 min-w-0 h-7 px-1 text-m-caption outline-none font-mono"
                inputStyle={{
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            {/* GST Rate — inline EnumSelect, same underline style */}
            <div className="pl-2">
              <EnumSelect
                label="GST %"
                value={String(gstRate)}
                onChange={(v) => setGstRate(Number(v))}
                options={GST_SLABS.map((rate) => ({ value: String(rate), label: `${rate}%` }))}
                inline
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Pricing</p>
        {/* Standard Cost + Reorder Point (side by side) */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Std. Cost (₹){" "}
              <span
                className="font-normal"
                style={{ color: "var(--color-ink-400)" }}
              >
                — opt.
              </span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={standardCost}
              onChange={(e) => setStandardCost(e.target.value)}
              placeholder="0.00"
              className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-500)",
              }}
            />
          </div>
          <div className="pl-2">
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Reorder pt.{" "}
              <span
                className="font-normal"
                style={{ color: "var(--color-ink-400)" }}
              >
                — opt.
              </span>
            </label>
            <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="50"
              className="w-full h-7 px-1 pr-10 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
            {unit && (
              <span
                className="absolute right-1 bottom-1 text-m-caption font-medium pointer-events-none"
                style={{ color: "var(--color-ink-400)" }}
              >
                {unit}
              </span>
            )}
            </div>
          </div>
        </div>
        {standardCost && Number(standardCost) > 0 ? (
          <p
            className="text-m-caption"
            style={{ color: "var(--color-ink-700)" }}
          >
            Cost incl. GST:{" "}
            <span
              className="font-bold"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatCurrency(Number(standardCost) * (1 + gstRate / 100))}
            </span>
          </p>
        ) : null}
        </div>

        {/* Description */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Notes</p>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Description{" "}
            <span
              className="font-normal"
              style={{ color: "var(--color-ink-400)" }}
            >
              — optional
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brand, specs, storage instructions…"
            rows={1}
            className="w-full px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "transparent",
              color: "var(--color-ink-950)",
            }}
          />
        </div>

        {/* Opening Stock — only shown when explicitly enabled (e.g. from materials FAB) */}
        {showOpeningStock && (
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Opening Stock{" "}
              <span className="font-normal" style={{ color: "var(--color-ink-400)" }}>— optional</span>
            </p>
            {locations.length === 0 ? (
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                No stock locations yet. Create a warehouse or site yard first to add opening stock.
              </p>
            ) : (
              <>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Add stock you already have on hand. Skip if you're just cataloging.
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Qty on hand
                    </label>
                    <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={openingQty}
                      onChange={(e) => setOpeningQty(e.target.value)}
                      placeholder="0"
                      className="w-full h-7 px-1 pr-10 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                    {unit && (
                      <span
                        className="absolute right-1 bottom-1 text-m-caption font-medium pointer-events-none"
                        style={{ color: "var(--color-ink-400)" }}
                      >
                        {unit}
                      </span>
                    )}
                    </div>
                  </div>
                  <div className="pl-2">
                    <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Unit cost
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={openingUnitCost}
                      onChange={(e) => setOpeningUnitCost(e.target.value)}
                      placeholder={standardCost || "0"}
                      className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
                <MobileStockLocationSelect
                  label="Location"
                  value={openingLocationId}
                  onChange={(v) => setOpeningLocationId(v)}
                  options={locations.map((l) => ({
                    value: l.id,
                    label: l.name,
                    sub: l.projectName ?? undefined,
                  }))}
                  placeholder="Select location…"
                  stacked
                />
                {openingQty && Number(openingQty) > 0 && (
                  <div
                    className="flex items-baseline justify-between rounded-[0.5rem] border px-3 py-2"
                    style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
                  >
                    <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                      Stock value
                    </span>
                    <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                      {formatCurrency(Number(openingQty) * (Number(openingUnitCost) || Number(standardCost) || 0))}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </form>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-between gap-3 px-1 py-2">
          {/* Summary — material name + category */}
          <div className="shrink-0 min-w-0">
            <p
              className="text-m-caption font-semibold uppercase tracking-wide truncate"
              style={{ color: "var(--color-ink-500)" }}
            >
              {name.trim()
                ? name.trim()
                : localCategories.find((c) => c.id === categoryId)?.name ?? "New Material"}
            </p>
            <p
              className="text-m-section font-bold tabular-nums"
              style={{ color: "var(--color-ink-950)" }}
            >
              {unit.trim() ? unit.trim().toUpperCase() : "—"}
            </p>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="size-4" />
                <span>Create Material</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Dialog wrapper for creating a material inline (from within other forms).
 * Uses MobileFabModal for the modern spring-in animation + drag handle.
 * For FAB-triggered creation, prefer MobileFabModal + MobileNewMaterialForm directly
 * (with originRect from useFabModal) so the dialog springs from the FAB itself.
 */
export function MobileNewMaterialDialog({
  open,
  onClose,
  onCreated,
  categories,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (material: {
    id: string;
    name: string;
    code: string;
    unit: string;
    hsnCode: string | null;
    gstRate: number;
    standardCost: number;
  }) => void;
  categories: { id: string; name: string; unit: string; hsnCode?: string | null; gstRate?: number | string | null | { toNumber(): number } }[];
  nested?: boolean;
}) {
  return (
    <MobileFabModal
      open={open}
      onClose={onClose}
      title="New Material"
      nested={nested}
    >
      <MobileNewMaterialForm
        onClose={onClose}
        onCreated={onCreated}
        categories={categories}
      />
    </MobileFabModal>
  );
}
