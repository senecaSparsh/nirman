"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

interface HsnSuggestion {
  hsnCode: string;
  description: string;
  gstRate: number;
  category: string | null;
}

/**
 * Mobile bottom-sheet dialog for creating a material inline.
 *
 * HSN/GST auto-fill flow:
 *   1. User types material name → debounced call to /api/hsn-gst?suggest=...
 *   2. Top suggestion auto-fills HSN code + GST rate (user can override)
 *   3. If user types a known HSN code → GST rate auto-looks up from master
 */
export function MobileNewMaterialDialog({
  open,
  onClose,
  onCreated,
  categories,
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
}) {
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

  // HSN suggestions
  const [hsnSuggestions, setHsnSuggestions] = useState<HsnSuggestion[]>([]);
  const [showHsnPicker, setShowHsnPicker] = useState(false);
  const [hsnSearch, setHsnSearch] = useState("");
  const [hsnSearchResults, setHsnSearchResults] = useState<HsnSuggestion[]>([]);
  const [hsnManuallySet, setHsnManuallySet] = useState(false);

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

  // ── Auto-suggest HSN when material name changes (debounced) ──
  useEffect(() => {
    if (hsnManuallySet || name.trim().length < 3) {
      setHsnSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const cat = categories.find((c) => c.id === categoryId);
      try {
        const params = new URLSearchParams({ suggest: name.trim() });
        if (cat) params.set("category", cat.name);
        const res = await fetch(`/api/hsn-gst?${params}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data) && data.length > 0) {
          setHsnSuggestions(data);
          // Auto-fill from top suggestion if HSN is empty
          if (!hsnCode) {
            setHsnCode(data[0].hsnCode);
            setGstRate(data[0].gstRate);
          }
        }
      } catch {
        // silent fail
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [name, categoryId, categories, hsnManuallySet, hsnCode]);

  // ── Auto-lookup GST when HSN code is manually entered (debounced) ──
  useEffect(() => {
    if (!hsnCode.trim() || hsnCode.trim().length < 4) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hsn-gst?hsn=${encodeURIComponent(hsnCode.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setGstRate(data.gstRate);
        }
      } catch {
        // silent fail — user can set GST manually
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [hsnCode]);

  // ── HSN picker search ──
  useEffect(() => {
    if (!showHsnPicker) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hsn-gst?q=${encodeURIComponent(hsnSearch)}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setHsnSearchResults(data);
        }
      } catch {
        setHsnSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [showHsnPicker, hsnSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      onCreated({
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
      setHsnManuallySet(false);
      setHsnSuggestions([]);
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Material
          </h2>
          <button
            onClick={onClose}
            className="press grid place-items-center size-7 rounded-[0.375rem]"
            style={{ color: "var(--color-ink-500)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          Add a new material to your inventory catalog.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OPC Cement 53"
              autoFocus
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Code */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AUTO"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
            {code === "AUTO" && autoCode && (
              <p className="text-[0.5625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                Auto-generated code: <span style={{ color: "var(--color-ink-950)" }}>{autoCode}</span>
              </p>
            )}
          </div>

          {/* Grade + Specification (side by side) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Grade
              </label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. 53"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Specification
              </label>
              <input
                type="text"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                placeholder="e.g. IS 269"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* Category + Unit (side by side) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Category <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); haptic(10); }}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Unit <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. BAG"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* HSN Code + GST Rate (side by side) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                HSN Code
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={hsnCode}
                  onChange={(e) => { setHsnCode(e.target.value); setHsnManuallySet(true); }}
                  placeholder="e.g. 2523"
                  className="flex-1 h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
                <button
                  type="button"
                  onClick={() => { setShowHsnPicker(true); setHsnSearch(""); }}
                  className="shrink-0 grid place-items-center size-10 rounded-[0.5rem] border press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
                  aria-label="Search HSN codes"
                >
                  <Search className="size-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                GST Rate (%)
              </label>
              <input
                type="number"
                value={gstRate}
                onChange={(e) => { setGstRate(Number(e.target.value)); setHsnManuallySet(true); }}
                placeholder="0"
                min={0}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* HSN auto-suggestion hint */}
          {hsnSuggestions.length > 0 && !hsnManuallySet && (
            <div className="rounded-[0.375rem] border px-2.5 py-1.5" style={{ borderColor: "var(--color-signal)", backgroundColor: "var(--color-signal-wash)" }}>
              <p className="text-[0.5rem] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-signal-dark)" }}>
                Suggested HSN
              </p>
              {hsnSuggestions.slice(0, 3).map((s) => (
                <button
                  key={s.hsnCode}
                  type="button"
                  onClick={() => { setHsnCode(s.hsnCode); setGstRate(s.gstRate); setHsnManuallySet(true); haptic(5); }}
                  className="flex items-center gap-2 w-full text-left py-0.5 press"
                >
                  <span className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                    {s.hsnCode}
                  </span>
                  <span className="text-[0.5rem] truncate flex-1" style={{ color: "var(--color-ink-700)" }}>
                    {s.description}
                  </span>
                  <span className="text-[0.5rem] font-bold shrink-0" style={{ color: "var(--color-signal-dark)" }}>
                    {s.gstRate}%
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Standard Cost */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Standard Cost (₹) <span className="font-normal" style={{ color: "var(--color-ink-400)" }}>— optional</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={standardCost}
              onChange={(e) => setStandardCost(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] font-bold tabular-nums outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
            {standardCost && Number(standardCost) > 0 ? (
              <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                Cost incl. GST: <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>₹{(Number(standardCost) * (1 + gstRate / 100)).toFixed(2)}</span>
              </p>
            ) : null}
          </div>

          {/* Submit */}
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
                <Plus className="size-4" />
                <span>Create Material</span>
              </>
            )}
          </button>
        </form>

        {/* ── HSN Picker Overlay ── */}
        {showHsnPicker && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={() => setShowHsnPicker(false)}
          >
            <div
              className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[70vh] flex flex-col"
              style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Search HSN Code
                </h3>
                <button
                  onClick={() => setShowHsnPicker(false)}
                  className="press grid place-items-center size-7 rounded-[0.375rem]"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--color-ink-400)" }} />
                <input
                  type="text"
                  value={hsnSearch}
                  onChange={(e) => setHsnSearch(e.target.value)}
                  placeholder="Search by code or description…"
                  autoFocus
                  className="w-full h-10 rounded-[0.5rem] border pl-8 pr-3 text-[0.75rem] outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-1">
                {hsnSearchResults.map((s) => (
                  <button
                    key={s.hsnCode}
                    type="button"
                    onClick={() => {
                      setHsnCode(s.hsnCode);
                      setGstRate(s.gstRate);
                      setHsnManuallySet(true);
                      setShowHsnPicker(false);
                      haptic(10);
                    }}
                    className="flex items-center gap-2.5 rounded-[0.5rem] border px-3 py-2 text-left press"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {s.hsnCode} <span className="font-normal" style={{ color: "var(--color-signal-dark)" }}>· {s.gstRate}% GST</span>
                      </p>
                      <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                        {s.description}
                      </p>
                    </div>
                    {hsnCode === s.hsnCode && (
                      <Check className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} />
                    )}
                  </button>
                ))}
                {hsnSearchResults.length === 0 && hsnSearch && (
                  <p className="text-center text-[0.625rem] py-4" style={{ color: "var(--color-ink-500)" }}>
                    No HSN codes found. Try a different search.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
