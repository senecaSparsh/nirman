"use client";

import {useState, useEffect} from "react";
import { useRouter } from "next/navigation";
import {
  Package, Send, Loader2, Plus,
  CheckCircle2, Sparkles,
} from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { HsnSacSearch } from "@/components/hsn-sac-search";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewCategoryDialog } from "./MobileNewCategoryDialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface Category {
  id: string;
  name: string;
  unit: string;
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
}: {
  categories: Category[];
  material?: ExistingMaterial;
}) {
  const router = useRouter();
  const isEdit = !!material;
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ name: string; code: string; id: string } | null>(null);
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

    const gst = Number(gstRate) || 0;
    const cost = Number(standardCost) || 0;
    const reorder = reorderPoint.trim() === "" ? null : Number(reorderPoint);
    if (gst < 0 || gst > 100) { toast.error("GST rate must be between 0 and 100"); return; }
    if (cost < 0) { toast.error("Standard cost cannot be negative"); return; }
    if (reorder !== null && reorder < 0) { toast.error("Reorder point cannot be negative"); return; }

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
      setSuccess({ name: data.name, code: data.code, id: data.id });
      toast.success(`${data.name} ${isEdit ? "updated" : "created"} successfully`);
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {isEdit ? "Material Updated" : "Material Created"}
        </p>
        <p className="text-m-body font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>
          {success.code}
        </p>
        <p className="text-m-section font-semibold mb-4" style={{ color: "var(--color-ink-700)" }}>
          {success.name}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push(`/m/materials/${success.id}`)}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
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
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
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
        <FormField label="Material name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
                onClick={() => { setCode(""); setCodePreview(""); }}
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
            options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewCategoryDialog
                open={open}
                onClose={onClose}
                onCreated={(cat) => {
                  setCategoryList((prev) => [...prev, cat]);
                  setUnit(cat.unit);
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
          />
        </FormField>
        <FormField label="GST rate (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            enterKeyHint="next"
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
            placeholder="0"
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Std. cost (₹)">
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              step="0.01"
              enterKeyHint="next"
              value={standardCost}
              onChange={(e) => setStandardCost(e.target.value)}
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
                      toast.success(`Pulled ₹${data.unitCost} from last purchase`);
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
        <FormField label="Reorder pt.">
          <input
            type="number"
            min="0"
            step="0.01"
            enterKeyHint="next"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
            placeholder={`50 ${unit}`}
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
          />
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-m-caption font-bold mb-0"
        style={{ color: "var(--color-ink-700)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}
