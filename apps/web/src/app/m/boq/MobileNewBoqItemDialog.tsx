"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type BoqItemType = "SECTION" | "SUBSECTION" | "LINE_ITEM";

const TYPE_LABELS: Record<BoqItemType, string> = {
  SECTION: "Section",
  SUBSECTION: "Subsection",
  LINE_ITEM: "Line Item",
};

interface ParentOption {
  id: string;
  serialNo: string;
  description: string;
  type: string;
}

interface MaterialOption {
  id: string;
  name: string;
  unit: string;
}

interface FormState {
  type: BoqItemType;
  parentId: string;
  serialNo: string;
  description: string;
  materialId: string;
  unit: string;
  estimatedQty: string;
  rate: string;
  notes: string;
}

/**
 * MobileNewBoqItemDialog — bottom-sheet form for adding a BOQ item
 * (section, subsection, or line item) from the mobile surface.
 * Submits POST /api/boq/items.
 */
export function MobileNewBoqItemDialog({
  open,
  onClose,
  projectId,
  parentItems,
  materials,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  parentItems: ParentOption[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    type: "LINE_ITEM",
    parentId: "",
    serialNo: "",
    description: "",
    materialId: "",
    unit: "",
    estimatedQty: "",
    rate: "",
    notes: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onMaterialChange(materialId: string) {
    set("materialId", materialId);
    // Auto-fill unit from material if not already set
    if (materialId && !form.unit) {
      const mat = materials.find((m) => m.id === materialId);
      if (mat) set("unit", mat.unit);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serialNo.trim()) { toast.error("Serial number is required (e.g. 1, 1.1, 1.1.1)"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (form.type === "LINE_ITEM") {
      if (!form.unit.trim()) { toast.error("Unit is required for line items"); return; }
      if (!form.estimatedQty || Number(form.estimatedQty) <= 0) { toast.error("Estimated qty must be > 0 for line items"); return; }
      if (!form.rate || Number(form.rate) < 0) { toast.error("Rate is required for line items"); return; }
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/boq/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          parentId: form.parentId || undefined,
          type: form.type,
          serialNo: form.serialNo.trim(),
          description: form.description.trim(),
          materialId: form.materialId || undefined,
          unit: form.type === "LINE_ITEM" ? form.unit.trim() : undefined,
          estimatedQty: form.type === "LINE_ITEM" ? Number(form.estimatedQty) : undefined,
          rate: form.type === "LINE_ITEM" ? Number(form.rate) : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create Bill of Quantities item");
      haptic([10, 40, 80]);
      toast.success("Bill of Quantities item added");
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
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };
  const isLineItem = form.type === "LINE_ITEM";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
              <FileText className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Add Bill of Quantities Item</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Type selector */}
          <div>
            <label className={labelClass} style={labelStyle}>Item Type</label>
            <div className="flex gap-2">
              {(Object.keys(TYPE_LABELS) as BoqItemType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { set("type", t); haptic(10); }}
                  className="flex-1 h-10 rounded-[0.5rem] border-2 text-[0.5625rem] font-bold press"
                  style={{
                    borderColor: form.type === t ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: form.type === t ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: form.type === t ? "#fff" : "var(--color-ink-500)",
                  }}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Parent (optional) */}
          {parentItems.length > 0 && (
            <div>
              <label className={labelClass} style={labelStyle}>Parent (optional)</label>
              <select value={form.parentId} onChange={(e) => set("parentId", e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Top-level (no parent) —</option>
                {parentItems.map((p) => (
                  <option key={p.id} value={p.id}>{p.serialNo} · {p.description}</option>
                ))}
              </select>
            </div>
          )}

          {/* Serial No */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Serial No. <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input type="text" value={form.serialNo} onChange={(e) => set("serialNo", e.target.value)} placeholder="e.g. 1, 1.1, 1.1.1" autoFocus enterKeyHint="next" className={inputClass} style={inputStyle} />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Description <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Civil Works, Concrete PCC, Cement bags" enterKeyHint="next" className={inputClass} style={inputStyle} />
          </div>

          {/* Line item specific fields */}
          {isLineItem && (
            <>
              {/* Material link (optional) */}
              {materials.length > 0 && (
                <div>
                  <label className={labelClass} style={labelStyle}>Link to Material (optional)</label>
                  <select value={form.materialId} onChange={(e) => onMaterialChange(e.target.value)} className={inputClass} style={inputStyle}>
                    <option value="">— None —</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Unit + Qty + Rate */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Unit <span style={{ color: "var(--color-stop)" }}>*</span></label>
                  <input type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="CUM" enterKeyHint="next" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Qty <span style={{ color: "var(--color-stop)" }}>*</span></label>
                  <input type="number" min={0.001} step="any" value={form.estimatedQty} onChange={(e) => set("estimatedQty", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Rate (₹) <span style={{ color: "var(--color-stop)" }}>*</span></label>
                  <input type="number" min={0} step="any" value={form.rate} onChange={(e) => set("rate", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className={labelClass} style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional context…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none" style={inputStyle} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * MobileBoqFab — floating action button + dialog launcher for adding BOQ items.
 */
export function MobileBoqFab({
  projectId,
  parentItems,
  materials,
}: {
  projectId: string;
  parentItems: ParentOption[];
  materials: MaterialOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "#fff",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
        aria-label="Add Bill of Quantities item"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewBoqItemDialog
          open={open}
          onClose={() => setOpen(false)}
          projectId={projectId}
          parentItems={parentItems}
          materials={materials}
        />
      )}
    </>
  );
}
