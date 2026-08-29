"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface MaterialOption { id: string; name: string; unit: string; }

export function MobileStandardConsumptionActions({
  consumptionId,
  initialWorkType,
  initialMaterialId,
  initialStandardQty,
  initialBaseQty,
  initialUnitOfMeasure,
  initialNotes,
  materials,
}: {
  consumptionId: string;
  initialWorkType: string;
  initialMaterialId: string;
  initialStandardQty: string;
  initialBaseQty: string;
  initialUnitOfMeasure: string;
  initialNotes: string;
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [workType, setWorkType] = useState(initialWorkType);
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [standardQty, setStandardQty] = useState(initialStandardQty);
  const [baseQty, setBaseQty] = useState(initialBaseQty);
  const [unitOfMeasure, setUnitOfMeasure] = useState(initialUnitOfMeasure);
  const [notes, setNotes] = useState(initialNotes);

  async function save() {
    if (!workType.trim()) return toast.error("Work type is required");
    if (!materialId) return toast.error("Material is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/standard-consumptions/${consumptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType: workType.trim(),
          materialId,
          standardQty: standardQty === "" ? undefined : Number(standardQty),
          baseQty: baseQty === "" ? undefined : Number(baseQty),
          unitOfMeasure: unitOfMeasure.trim(),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Benchmark updated");
      setShowEdit(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/standard-consumptions/${consumptionId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Benchmark deleted");
      router.push("/m/standard-consumptions");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <>
      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowEdit(true)}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Pencil className="size-3" />
          Edit
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
        >
          <Trash2 className="size-3" />
          Delete
        </button>
      </div>

      {/* Edit sheet */}
      {showEdit ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowEdit(false)}
        >
          <div
            className="w-full rounded-t-[1rem] max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Edit Benchmark</p>
              <button onClick={() => setShowEdit(false)} className="press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Work Type *</label>
                <input value={workType} onChange={(e) => setWorkType(e.target.value)} placeholder="e.g. Foundation, Plastering" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Material *</label>
                <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={inputClass} style={inputStyle}>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Standard Qty</label>
                  <input type="number" step="any" inputMode="decimal" value={standardQty} onChange={(e) => setStandardQty(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Base Qty</label>
                  <input type="number" step="any" inputMode="decimal" value={baseQty} onChange={(e) => setBaseQty(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Unit of Measure</label>
                <input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} placeholder="e.g. sqft, cum, rmt" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Notes</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="w-full rounded-[0.5rem] border px-2.5 py-2 text-[0.75rem] resize-none outline-none" style={inputStyle} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowEdit(false)} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={save} disabled={saving || !workType.trim()} className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !workType.trim() ? 0.5 : 1 }}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      {showDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowDelete(false)}
        >
          <div
            className="w-full rounded-t-[1rem]"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Delete Benchmark?</p>
              <button onClick={() => setShowDelete(false)} className="press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-[0.625rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will permanently delete this standard consumption benchmark. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowDelete(false)} disabled={deleting} className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={del} disabled={deleting} className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
