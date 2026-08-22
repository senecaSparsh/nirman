"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

interface FormState {
  supplierId: string;
  materialId: string;
  agreedRate: string;
  validFrom: string;
  validTo: string;
  minQty: string;
  maxQty: string;
  notes: string;
}

export function MobileNewRateContractDialog({
  open,
  onClose,
  suppliers,
  materials,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    supplierId: "",
    materialId: "",
    agreedRate: "",
    validFrom: "",
    validTo: "",
    minQty: "",
    maxQty: "",
    notes: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) { toast.error("Supplier is required"); return; }
    if (!form.materialId) { toast.error("Material is required"); return; }
    if (!form.agreedRate || Number(form.agreedRate) <= 0) { toast.error("Agreed rate must be greater than 0"); return; }
    if (!form.validFrom || !form.validTo) { toast.error("Valid from and to dates are required"); return; }
    if (new Date(form.validTo) <= new Date(form.validFrom)) { toast.error("Valid-to must be after valid-from"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/rate-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: form.supplierId,
          materialId: form.materialId,
          agreedRate: Number(form.agreedRate),
          validFrom: new Date(form.validFrom).toISOString(),
          validTo: new Date(form.validTo).toISOString(),
          minQty: form.minQty === "" ? undefined : Number(form.minQty),
          maxQty: form.maxQty === "" ? undefined : Number(form.maxQty),
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create rate contract");
      haptic([10, 40, 80]);
      toast.success("Rate contract created");
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
              <FileText className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>New Rate Contract</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <MobileSelectWithCreate
            label="Supplier"
            required
            value={form.supplierId}
            onChange={(v) => set("supplierId", v)}
            placeholder="— Select supplier —"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            inputClass={inputClass}
            inputStyle={inputStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewSupplierDialog open={open} onClose={onClose} onCreated={(s) => onCreated(s.id, s.name)} />
            )}
          />

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

          <div>
            <label className={labelClass} style={labelStyle}>Agreed Rate (₹) <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input type="number" min={0.01} step="any" value={form.agreedRate} onChange={(e) => set("agreedRate", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Valid From <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Valid To <span style={{ color: "var(--color-stop)" }}>*</span></label>
              <input type="date" value={form.validTo} onChange={(e) => set("validTo", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Min Qty (optional)</label>
              <input type="number" min={0} step="any" value={form.minQty} onChange={(e) => set("minQty", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Max Qty (optional)</label>
              <input type="number" min={0} step="any" value={form.maxQty} onChange={(e) => set("maxQty", e.target.value)} placeholder="0" inputMode="decimal" className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Additional terms…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none" style={inputStyle} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Contract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
