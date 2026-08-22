"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Beaker } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

interface FormState {
  workType: string;
  materialId: string;
  standardQty: string;
  baseQty: string;
  unitOfMeasure: string;
  notes: string;
}

export function MobileNewStandardConsumptionDialog({
  open,
  onClose,
  materials,
}: {
  open: boolean;
  onClose: () => void;
  materials: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    workType: "",
    materialId: "",
    standardQty: "",
    baseQty: "1",
    unitOfMeasure: "SQM",
    notes: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workType.trim()) { toast.error("Work type is required"); return; }
    if (!form.materialId) { toast.error("Material is required"); return; }
    if (!form.standardQty || Number(form.standardQty) <= 0) { toast.error("Standard qty must be > 0"); return; }
    if (!form.unitOfMeasure.trim()) { toast.error("Unit of measure is required"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/standard-consumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType: form.workType.trim(),
          materialId: form.materialId,
          standardQty: Number(form.standardQty),
          baseQty: form.baseQty === "" ? 1 : Number(form.baseQty),
          unitOfMeasure: form.unitOfMeasure.trim(),
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create benchmark");
      haptic([10, 40, 80]);
      toast.success("Standard consumption added");
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
              <Beaker className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>New Standard Consumption</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Work Type <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input type="text" value={form.workType} onChange={(e) => set("workType", e.target.value)} placeholder="e.g. Foundation, Plastering" autoFocus enterKeyHint="next" className={inputClass} style={inputStyle} />
          </div>

          <MobileSelectWithCreate
            label="Material"
            required
            value={form.materialId}
            onChange={(v) => set("materialId", v)}
            placeholder="— Select material —"
            options={materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
            inputClass={inputClass}
            inputStyle={inputStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewMaterialDialog open={open} onClose={onClose} categories={[]} onCreated={(m) => onCreated(m.id, m.name)} />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Standard Qty <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input type="number" min={0.001} step="any" value={form.standardQty} onChange={(e) => set("standardQty", e.target.value)} placeholder="e.g. 1.5" inputMode="decimal" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Base Qty</label>
              <input type="number" min={0.001} step="any" value={form.baseQty} onChange={(e) => set("baseQty", e.target.value)} placeholder="1" inputMode="decimal" className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Unit of Measure <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input type="text" value={form.unitOfMeasure} onChange={(e) => set("unitOfMeasure", e.target.value)} placeholder="e.g. SQM, CUM, NOS" enterKeyHint="next" className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional context…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none" style={inputStyle} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add Benchmark"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
