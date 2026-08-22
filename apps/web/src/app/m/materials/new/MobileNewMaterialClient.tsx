"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Send, Loader2, Plus,
  CheckCircle2, Sparkles,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileNewCategoryDialog } from "./MobileNewCategoryDialog";

interface Category {
  id: string;
  name: string;
  unit: string;
}

const COMMON_UNITS = ["NOS", "BAG", "KG", "TON", "MTR", "FEET", "SQFT", "CUM", "LTR", "BOX", "ROLL", "SET"];

export default function MobileNewMaterialClient({
  categories,
}: {
  categories: Category[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ name: string; code: string; id: string } | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [categoryList, setCategoryList] = useState(categories);

  const [code, setCode] = useState("AUTO");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [specification, setSpecification] = useState("");
  const [categoryId, setCategoryId] = useState(categoryList[0]?.id ?? "");
  const [unit, setUnit] = useState(categoryList[0]?.unit ?? "NOS");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [standardCost, setStandardCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [description, setDescription] = useState("");

  // Auto-code preview — fetch from API when category or grade changes.
  const [codePreview, setCodePreview] = useState("");
  const selectedCategory = categoryList.find((c) => c.id === categoryId);
  useEffect(() => {
    if (!selectedCategory || code !== "AUTO") {
      setCodePreview("");
      return;
    }
    const url = `/api/materials/auto-code?categoryName=${encodeURIComponent(selectedCategory.name)}&grade=${encodeURIComponent(grade)}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: { preview?: string }) => setCodePreview(data.preview ?? ""))
      .catch(() => setCodePreview(""));
  }, [selectedCategory, grade, code]);

  function handleCategoryChange(newCatId: string) {
    setCategoryId(newCatId);
    const cat = categoryList.find((c) => c.id === newCatId);
    if (cat) setUnit(cat.unit);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Material name is required"); return; }
    if (!categoryId) { toast.error("Please select a category"); return; }
    if (!unit.trim()) { toast.error("Unit is required"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || "AUTO",
          name: name.trim(),
          grade: grade.trim() || null,
          specification: specification.trim() || null,
          categoryId,
          unit: unit.trim().toUpperCase(),
          hsnCode: hsnCode.trim() || null,
          gstRate: Number(gstRate) || 0,
          standardCost: Number(standardCost) || 0,
          reorderPoint: reorderPoint.trim() === "" ? null : Number(reorderPoint),
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create material");

      haptic([10, 40, 80]);
      setSuccess({ name: data.name, code: data.code, id: data.id });
      toast.success(`${data.name} created successfully`);
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Material Created
        </p>
        <p className="text-[0.6875rem] font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>
          {success.code}
        </p>
        <p className="text-[0.75rem] font-semibold mb-4" style={{ color: "var(--color-ink-700)" }}>
          {success.name}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/m/materials/${success.id}`)}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View Material
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setCode("AUTO");
              setName("");
              setGrade("");
              setSpecification("");
              setStandardCost("");
              setReorderPoint("");
              setDescription("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
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
          <p className="text-[0.75rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
            No material categories
          </p>
          <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
            You need at least one category before adding materials.
          </p>
          <button
            onClick={() => setShowNewCategory(true)}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press"
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
          }}
        />
      </div>
    );
  }

  const inputClass = "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" } as React.CSSProperties;
  const costValue = Number(standardCost) || 0;
  const totalWithGst = costValue * (1 + (Number(gstRate) || 0) / 100);

  return (
    <div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ── Code (auto-generated by default, manual override available) ── */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Material code
          </label>
          {code === "AUTO" ? (
            <div className="space-y-1.5">
              <div
                className="flex items-center gap-2 rounded-[0.375rem] border px-2.5 py-2"
                style={{ borderColor: "var(--color-steel)", backgroundColor: "var(--color-steel-wash)" }}
              >
                <Sparkles className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />
                <span className="text-[0.75rem] font-mono font-bold" style={{ color: "var(--color-steel-dark)" }}>
                  {codePreview || "Auto-generated"}
                </span>
                <span className="text-[0.5rem] ml-auto" style={{ color: "var(--color-ink-500)" }}>
                  Auto from category + grade
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setCode(""); setCodePreview(""); }}
                className="text-[0.5625rem] font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                Enter code manually instead
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CEM-OPC53-001"
              autoComplete="off"
              enterKeyHint="next"
              className={`${inputClass} font-mono uppercase`}
              style={inputStyle}
            />
          )}
        </div>

        {/* ── Name ── */}
        <FormField label="Material name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cement OPC 53 Grade"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>

        {/* ── Grade (used for auto-code generation) ── */}
        <FormField label="Grade (optional)">
          <input
            type="text"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="e.g. Fe500D, OPC 53, 20mm, IS 1786"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>

        {/* ── Specification ── */}
        <FormField label="Specification (optional)">
          <input
            type="text"
            value={specification}
            onChange={(e) => setSpecification(e.target.value)}
            placeholder="e.g. IS 1786:2008, TMT bars"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>

        {/* ── Category ── */}
        <FormField label="Category" required>
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {categoryList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FormField>

        {/* ── Unit ── */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            Unit of measure <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {COMMON_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => { setUnit(u); haptic(10); }}
                className="h-7 px-2 rounded-[0.25rem] text-[0.5625rem] font-semibold press"
                style={{
                  color: unit === u ? "#fff" : "var(--color-ink-700)",
                  backgroundColor: unit === u ? "var(--color-ink-950)" : "var(--color-concrete)",
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* ── HSN + GST ── */}
        <div className="grid grid-cols-2 gap-2">
          <FormField label="HSN code">
            <input
              type="text"
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              placeholder="25232900"
              enterKeyHint="next"
              className={`${inputClass} font-mono`}
              style={inputStyle}
            />
          </FormField>
          <FormField label="GST rate (%)">
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              placeholder="0"
              className={`${inputClass} tabular-nums`}
              style={inputStyle}
            />
          </FormField>
        </div>

        {/* ── Standard cost ── */}
        <FormField label="Standard cost (₹)">
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            value={standardCost}
            onChange={(e) => setStandardCost(e.target.value)}
            placeholder="0"
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
        </FormField>

        {/* ── Reorder point ── */}
        <FormField label="Reorder point (optional)">
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
            placeholder={`e.g. 50 ${unit}`}
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
        </FormField>

        {/* ── Description ── */}
        <FormField label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Grade, brand, specs…"
            rows={2}
            className={`${inputClass} resize-none`}
            style={inputStyle}
          />
        </FormField>

        {/* ── Cost summary ── */}
        {costValue > 0 && (
          <div
            className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
            style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
          >
            <span className="text-[0.5625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Cost incl. GST
            </span>
            <span className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(totalWithGst)}
            </span>
          </div>
        )}

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Send className="size-4" />
              <span>Create Material</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/* ─── Form field wrapper — matches scrap generation form ─── */
function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-[0.5625rem] font-semibold mb-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}
