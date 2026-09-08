"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
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
  categories: { id: string; name: string; unit: string }[];
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
  const [autoCode, setAutoCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // When category changes, auto-set unit to the category's default unit
  useEffect(() => {
    if (!categoryId) {
      setUnit("");
      return;
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) setUnit(cat.unit);
  }, [categoryId, categories]);

  // Fetch auto-code preview when code is "AUTO"
  const fetchAutoCode = useCallback(async () => {
    if (code !== "AUTO" || !categoryId) {
      setAutoCode(null);
      return;
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      setAutoCode(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/materials/auto-code?categoryName=${encodeURIComponent(cat.name)}&grade=${encodeURIComponent(grade)}`,
      );
      const data = await res.json();
      if (res.ok && data.code) {
        setAutoCode(data.code);
      } else {
        setAutoCode(null);
      }
    } catch {
      setAutoCode(null);
    }
  }, [code, categoryId, categories, grade]);

  useEffect(() => {
    fetchAutoCode();
  }, [fetchAutoCode]);

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
      setAutoCode(null);
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
        {/* Name (full width) + auto-code chip */}
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
          {code === "AUTO" && autoCode ? (
            <p
              className="text-m-caption mt-1 font-mono"
              style={{ color: "var(--color-ink-500)" }}
            >
              Auto-code: <span style={{ color: "var(--color-signal-dark)" }}>{autoCode}</span>
            </p>
          ) : null}
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
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select…"
            stacked
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
              <span className="block text-m-caption font-bold mb-0.5" style={{ color: "var(--color-ink-700)" }}>
                HSN Code
              </span>
              <HsnSacSearch
                value={hsnCode}
                onCodeChange={setHsnCode}
                onGstRateChange={(rate) => setGstRate(rate)}
                placeholder="2523"
                materialName={name}
                categoryName={categories.find((c) => c.id === categoryId)?.name}
                inputClassName="flex-1 min-w-0 h-7 px-1 text-m-caption text-right outline-none font-mono"
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
                align="right"
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Pricing</p>
        {/* Standard Cost */}
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Standard Cost (₹){" "}
            <span
              className="font-normal"
              style={{ color: "var(--color-ink-400)" }}
            >
              — optional
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
          {standardCost && Number(standardCost) > 0 ? (
            <p
              className="text-m-caption mt-1"
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
        </div>
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
                : categories.find((c) => c.id === categoryId)?.name ?? "New Material"}
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
  categories: { id: string; name: string; unit: string }[];
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
