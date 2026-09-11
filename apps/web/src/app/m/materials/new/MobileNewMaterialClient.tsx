"use client";

import {useState, useEffect, useMemo} from "react";
import { useRouter } from "next/navigation";
import {
  Package, Send, Loader2, Plus,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { previewMaterialCode } from "@/lib/material-code";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { required, nonNegativeNumber, numberInRange } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import { HsnSacSearch } from "@/components/hsn-sac-search";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileStockLocationSelect } from "@/components/mobile/selectors";
import { MobileNewCategoryDialog } from "./MobileNewCategoryDialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface Category {
  id: string;
  name: string;
  unit: string;
  hsnCode?: string | null;
  gstRate?: number | string | null | { toNumber(): number };
}

/** Normalize gstRate (which may be a Prisma Decimal) to a number. */
function gstToNum(v: Category["gstRate"]): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return v.toNumber();
}

interface ExistingMaterial {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  specification: string | null;
  categoryId: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  standardCost: number;
  reorderPoint: number | null;
  description: string | null;
}

const COMMON_UNITS = ["NOS", "BAG", "KG", "TON", "MTR", "FEET", "SQFT", "CUM", "LTR", "BOX", "ROLL", "SET"];

export default function MobileNewMaterialClient({
  categories,
  material,
  locations = [],
}: {
  categories: Category[];
  material?: ExistingMaterial;
  locations?: { id: string; name: string; projectName: string | null }[];
}) {
  const router = useRouter();
  const isEdit = !!material;
  const [saving, setSaving] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [categoryList, setCategoryList] = useState(categories);

  const [code, setCode] = useState(material?.code ?? "AUTO");
  const [name, setName] = useState(material?.name ?? "");
  const [grade, setGrade] = useState(material?.grade ?? "");
  const [specification, setSpecification] = useState(material?.specification ?? "");
  const [categoryId, setCategoryId] = useState(material?.categoryId ?? categoryList[0]?.id ?? "");
  const [unit, setUnit] = useState(material?.unit ?? categoryList[0]?.unit ?? "NOS");
  const [hsnCode, setHsnCode] = useState(material?.hsnCode ?? "");
  const [gstRate, setGstRate] = useState(String(material?.gstRate ?? 0));
  const [standardCost, setStandardCost] = useState(material ? String(material.standardCost) : "");
  const [reorderPoint, setReorderPoint] = useState(material?.reorderPoint != null ? String(material.reorderPoint) : "");
  const [description, setDescription] = useState(material?.description ?? "");
  // Opening stock — only for new materials (not edit)
  const [openingQty, setOpeningQty] = useState("");
  const [openingLocationId, setOpeningLocationId] = useState(locations[0]?.id ?? "");
  const [openingUnitCost, setOpeningUnitCost] = useState("");

  // ── Inline validation ──────────────────────────────────────────
  type MobileMaterialForm = {
    name: string; categoryId: string; unit: string; gstRate: string;
    standardCost: string; reorderPoint: string; openingQty: string; openingUnitCost: string;
  };
  const validationRules: ValidationRules<MobileMaterialForm> = {
    name: (v) => required(v as string, "Material name"),
    categoryId: (v) => required(v as string, "Category"),
    unit: (v) => required(v as string, "Unit"),
    gstRate: (v) => numberInRange(v as string, 0, 100, "GST rate"),
    standardCost: (v) => nonNegativeNumber(v as string, "Standard cost"),
    reorderPoint: (v) => nonNegativeNumber(v as string, "Reorder pt."),
    openingQty: (v) => nonNegativeNumber(v as string, "Qty on hand"),
    openingUnitCost: (v) => nonNegativeNumber(v as string, "Unit cost"),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<MobileMaterialForm>(validationRules);
  const formValues: MobileMaterialForm = { name, categoryId, unit, gstRate, standardCost, reorderPoint, openingQty, openingUnitCost };

  // Instant client-side code preview — no API call needed.
  const selectedCategory = categoryList.find((c) => c.id === categoryId);
  const codePreview = useMemo(() => {
    if (!selectedCategory || code !== "AUTO") return "";
    return previewMaterialCode(selectedCategory.name, grade);
  }, [selectedCategory, grade, code]);

  function handleCategoryChange(newCatId: string) {
    setCategoryId(newCatId);
    const cat = categoryList.find((c) => c.id === newCatId);
    if (cat) {
      setUnit(cat.unit);
      // Auto-fill HSN + GST from category defaults (user can still override)
      if (cat.hsnCode) setHsnCode(cat.hsnCode);
      if (cat.gstRate != null) setGstRate(String(gstToNum(cat.gstRate)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll(formValues)) { toast.error("Please fix the errors in the form"); return; }

    const gst = Number(gstRate) || 0;
    const cost = Number(standardCost) || 0;
    const reorder = reorderPoint.trim() === "" ? null : Number(reorderPoint);

    setSaving(true);
    haptic(10);
    try {
      const payload = {
        code: code.trim() || "AUTO",
        name: name.trim(),
        grade: grade.trim() || null,
        specification: specification.trim() || null,
        categoryId,
        unit: unit.trim().toUpperCase(),
        hsnCode: hsnCode.trim() || null,
        gstRate: gst,
        standardCost: cost,
        reorderPoint: reorder,
        description: description.trim() || null,
        // Opening stock — only sent if qty > 0 and a location is selected
        ...(openingQty && Number(openingQty) > 0 && openingLocationId
          ? {
              openingStock: {
                locationId: openingLocationId,
                qty: Number(openingQty),
                unitCost: openingUnitCost ? Number(openingUnitCost) : cost,
                reason: "Opening stock entry",
              },
            }
          : {}),
      };
      const url = isEdit ? `/api/materials/${material!.id}` : "/api/materials";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${isEdit ? "update" : "create"} material`);

      haptic([10, 40, 80]);
      toast.success(`${data.name} ${isEdit ? "updated" : "created"} successfully`, {
        description: data.code,
      });
      // Go straight to the material detail page — no extra success screen
      router.push(`/m/materials/${data.id}`);
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  /* ── Empty categories guard — with inline create action ── */
  if (categoryList.length === 0) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <div
          className="rounded-[0.625rem] border p-4 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Package className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
            No material categories
          </p>
          <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-500)" }}>
            You need at least one category before adding materials.
          </p>
          <button
            onClick={() => setShowNewCategory(true)}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Create Category
          </button>
        </div>
        <MobileNewCategoryDialog
          open={showNewCategory}
          onClose={() => setShowNewCategory(false)}
          onCreated={(cat) => {
            setCategoryList((prev) => [...prev, cat]);
            setCategoryId(cat.id);
            setUnit(cat.unit);
            if (cat.hsnCode) setHsnCode(cat.hsnCode);
            if (cat.gstRate != null) setGstRate(String(gstToNum(cat.gstRate)));
          }}
        />
      </div>
    );
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" } as React.CSSProperties;
  const costValue = Number(standardCost) || 0;
  const totalWithGst = costValue * (1 + (Number(gstRate) || 0) / 100);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">

      {/* ── Identity ── */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Identity
        </p>

      {/* Name + Code — side by side */}
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Material name" required error={errors.name}>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); clearError("name"); }}
            onBlur={() => onBlur("name", formValues)}
            placeholder="Cement OPC 53"
            autoComplete="off"
            enterKeyHint="next"
            autoFocus={!isEdit}
            className={inputClass}
            style={inputStyle}
          />
        </FormField>
        <div>
          <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
            Code
          </label>
          {code === "AUTO" ? (
            <div className="space-y-1">
              <div
                className="flex items-center gap-1.5 rounded-[0.375rem] border px-2 py-2 h-10"
                style={{ borderColor: "var(--color-steel)", backgroundColor: "var(--color-steel-wash)" }}
              >
                <Sparkles className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />
                <span className="text-m-body font-mono font-bold truncate" style={{ color: "var(--color-steel-dark)" }}>
                  {codePreview || "Auto"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setCode(""); }}
                className="text-m-caption font-semibold press"
                style={{ color: "var(--color-ink-500)" }}
              >
                Enter manually
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CEM-OPC53"
              autoComplete="off"
              enterKeyHint="next"
              className={`${inputClass} font-mono uppercase`}
              style={inputStyle}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Grade">
          <input
            type="text"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Fe500D"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>
        <FormField label="Specification">
          <input
            type="text"
            value={specification}
            onChange={(e) => setSpecification(e.target.value)}
            placeholder="IS 1786:2008"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>
      </div>

      </div>

      {/* ── Classification ── */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Classification
        </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <MobileSelectWithCreate
            label="Category"
            required
            value={categoryId}
            onChange={handleCategoryChange}
            options={categoryList.map((c) => ({
              value: c.id,
              label: c.name,
              sub: c.hsnCode ? `HSN ${c.hsnCode}${c.gstRate != null ? ` · ${gstToNum(c.gstRate)}% GST` : ""}` : undefined,
            }))}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewCategoryDialog
                open={open}
                onClose={onClose}
                onCreated={(cat) => {
                  setCategoryList((prev) => [...prev, cat]);
                  setUnit(cat.unit);
                  if (cat.hsnCode) setHsnCode(cat.hsnCode);
                  if (cat.gstRate != null) setGstRate(String(gstToNum(cat.gstRate)));
                  onCreated(cat.id, cat.name);
                }}
              />
            )}
          />
        </div>
        <EnumSelect
          label="Unit"
          required
          value={unit}
          onChange={(v) => setUnit(v)}
          options={COMMON_UNITS.map((u) => ({ value: u, label: u }))}
        />
      </div>

      </div>

      {/* ── Tax & Cost ── */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Tax &amp; Cost
        </p>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="HSN code">
          <HsnSacSearch
            value={hsnCode}
            onCodeChange={setHsnCode}
            onGstRateChange={(rate) => setGstRate(String(rate))}
            placeholder="Search…"
            inputClassName={`${inputClass} font-mono`}
            inputStyle={inputStyle}
            materialName={name}
            categoryName={selectedCategory?.name}
          />
        </FormField>
        <FormField label="GST rate (%)" error={errors.gstRate}>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            enterKeyHint="next"
            value={gstRate}
            onChange={(e) => { setGstRate(e.target.value); clearError("gstRate"); }}
            onBlur={() => onBlur("gstRate", formValues)}
            placeholder="0"
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Std. cost (₹)" error={errors.standardCost}>
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              step="0.01"
              enterKeyHint="next"
              value={standardCost}
              onChange={(e) => { setStandardCost(e.target.value); clearError("standardCost"); }}
              onBlur={() => onBlur("standardCost", formValues)}
              placeholder="0"
              className={`${inputClass} tabular-nums flex-1`}
              style={inputStyle}
            />
            {isEdit && material && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/materials/${material.id}/last-purchase`);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Failed");
                    if (data.unitCost > 0) {
                      setStandardCost(String(data.unitCost));
                      haptic(10);
                      toast.success(`Pulled ${formatCurrency(data.unitCost)} from last purchase`);
                    } else {
                      toast.info("No previous purchase found");
                    }
                  } catch {
                    toast.error("Could not fetch last purchase price");
                  }
                }}
                className="shrink-0 rounded-[0.375rem] border px-2 text-m-caption font-bold press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
              >
                Pull
              </button>
            )}
          </div>
        </FormField>
        <FormField label="Reorder pt." error={errors.reorderPoint}>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              enterKeyHint="next"
              value={reorderPoint}
              onChange={(e) => { setReorderPoint(e.target.value); clearError("reorderPoint"); }}
              onBlur={() => onBlur("reorderPoint", formValues)}
              placeholder="50"
              className={`${inputClass} tabular-nums pr-12`}
              style={inputStyle}
            />
            {unit && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-m-caption font-medium" style={{ color: "var(--color-ink-400)" }}>
                {unit}
              </span>
            )}
          </div>
        </FormField>
      </div>

      {costValue > 0 && (
        <div
          className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
          style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
        >
          <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Cost incl. GST
          </span>
          <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(totalWithGst)}
          </span>
        </div>
      )}
      </div>

      {/* ── Details ── */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Details
        </p>

      <FormField label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brand, specs, storage instructions…"
          rows={1}
          className={`${inputClass} resize-none`}
          style={inputStyle}
        />
      </FormField>
      </div>

      {/* ── Opening Stock (only for new materials) ── */}
      {!isEdit && (
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
            <FormField label="Qty on hand" error={errors.openingQty}>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={openingQty}
                  onChange={(e) => { setOpeningQty(e.target.value); clearError("openingQty"); }}
                  onBlur={() => onBlur("openingQty", formValues)}
                  placeholder="0"
                  className={`${inputClass} tabular-nums pr-12`}
                  style={inputStyle}
                />
                {unit && (
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-m-caption font-medium" style={{ color: "var(--color-ink-400)" }}>
                    {unit}
                  </span>
                )}
              </div>
            </FormField>
            <div className="pl-2">
              <label className="block text-m-caption font-bold mb-0" style={{ color: errors.openingUnitCost ? "var(--color-stop)" : "var(--color-ink-700)" }}>
                Unit cost
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                enterKeyHint="next"
                value={openingUnitCost}
                onChange={(e) => { setOpeningUnitCost(e.target.value); clearError("openingUnitCost"); }}
                onBlur={() => onBlur("openingUnitCost", formValues)}
                placeholder={standardCost || "0"}
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
              {errors.openingUnitCost && (
                <p className="text-m-caption font-medium mt-0.5" style={{ color: "var(--color-stop)" }} role="alert">
                  {errors.openingUnitCost}
                </p>
              )}
            </div>
          </div>
          <div>
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
          </div>
          {openingQty && Number(openingQty) > 0 && (
            <div
              className="flex items-baseline justify-between rounded-[0.5rem] border px-3 py-2"
              style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
            >
              <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Stock value
              </span>
              <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                {formatCurrencyCompact(Number(openingQty) * (Number(openingUnitCost) || costValue))}
              </span>
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Send className="size-4" />
            <span>{isEdit ? "Update Material" : "Create Material"}</span>
          </>
        )}
      </button>
    </form>
  );
}

/* ─── Form field wrapper ─── */
function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-m-caption font-bold mb-0"
        style={{ color: error ? "var(--color-stop)" : "var(--color-ink-700)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
      {error && (
        <p className="text-m-caption font-medium mt-0.5" style={{ color: "var(--color-stop)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
