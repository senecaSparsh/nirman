"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
    if (!form.serialNo.trim()) {
      toast.error("Serial number is required (e.g. 1, 1.1, 1.1.1)");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (form.type === "LINE_ITEM") {
      if (!form.unit.trim()) {
        toast.error("Unit is required for line items");
        return;
      }
      if (!form.estimatedQty || Number(form.estimatedQty) <= 0) {
        toast.error("Estimated qty must be > 0 for line items");
        return;
      }
      if (!form.rate || Number(form.rate) < 0) {
        toast.error("Rate is required for line items");
        return;
      }
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
          estimatedQty:
            form.type === "LINE_ITEM" ? Number(form.estimatedQty) : undefined,
          rate: form.type === "LINE_ITEM" ? Number(form.rate) : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error ?? "Failed to create Bill of Quantities item",
        );
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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const isLineItem = form.type === "LINE_ITEM";

  return (
    <MobileDialog open={open} onClose={onClose} title="New BOQ Item">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Item Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Item Details</p>

            {/* Type selector — horizontal */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Item Type
              </label>
              <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                {(Object.keys(TYPE_LABELS) as BoqItemType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      set("type", t);
                      haptic(10);
                    }}
                    className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                    style={{
                      borderColor:
                        form.type === t
                          ? "var(--color-ink-950)"
                          : "var(--color-line)",
                      backgroundColor:
                        form.type === t
                          ? "var(--color-ink-950)"
                          : "var(--color-paper)",
                      color:
                        form.type === t
                          ? "var(--color-paper)"
                          : "var(--color-ink-500)",
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
                <label className={labelClass} style={labelStyle}>
                  Parent (optional)
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) => set("parentId", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">— Top-level (no parent) —</option>
                  {parentItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.serialNo} · {p.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Serial No + Description */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Serial No. <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.serialNo}
                  onChange={(e) => set("serialNo", e.target.value)}
                  placeholder="e.g. 1.1.1"
                  autoFocus
                  enterKeyHint="next"
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Description <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. Concrete PCC"
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Line item specific fields */}
            {isLineItem && (
              <>
                {/* Material link (optional) */}
                {materials.length > 0 && (
                  <MobileSelectWithCreate
                    label="Link to Material (optional)"
                    required={false}
                    value={form.materialId}
                    onChange={(v) => onMaterialChange(v)}
                    placeholder="— None —"
                    options={materials.map((m) => ({
                      value: m.id,
                      label: `${m.name} (${m.unit})`,
                    }))}
                    inputClass={inputClass}
                    inputStyle={inputStyle}
                    renderDialog={({ open, onClose, onCreated }) => (
                      <MobileNewMaterialDialog
                        open={open}
                        onClose={onClose}
                        categories={[]}
                        onCreated={(m) => onCreated(m.id, m.name)}
                      />
                    )}
                  />
                )}

                {/* Unit + Qty + Rate */}
                <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Unit <span style={{ color: "var(--color-stop)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={(e) => set("unit", e.target.value)}
                      placeholder="CUM"
                      enterKeyHint="next"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Qty <span style={{ color: "var(--color-stop)" }}>*</span>
                    </label>
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={form.estimatedQty}
                      onChange={(e) => set("estimatedQty", e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Rate (₹){" "}
                      <span style={{ color: "var(--color-stop)" }}>*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.rate}
                      onChange={(e) => set("rate", e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Notes (optional)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Additional context…"
                className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 ">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-700)",
                backgroundColor: "var(--color-paper)",
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
              {saving ? "Adding…" : "Add Item"}
            </button>
          </div>
        </form>
    </MobileDialog>
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
          bottom:
            "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
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
