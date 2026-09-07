"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

interface FormState {
  workType: string;
  materialId: string;
  standardQty: string;
  baseQty: string;
  unitOfMeasure: string;
  notes: string;
}

/**
 * MobileNewStandardConsumptionForm — form content for recording a
 * standard consumption benchmark.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * standard-consumptions page, or wrapped by
 * <MobileNewStandardConsumptionDialog> (legacy bottom-sheet backdrop)
 * for inline creation from other pages. Mirrors MobileNewLeaveForm /
 * MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewStandardConsumptionForm({
  onClose,
  materials,
}: {
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
    if (!form.workType.trim()) {
      toast.error("Work type is required");
      return;
    }
    if (!form.materialId) {
      toast.error("Material is required");
      return;
    }
    if (!form.standardQty || Number(form.standardQty) <= 0) {
      toast.error("Standard qty must be > 0");
      return;
    }
    if (!form.unitOfMeasure.trim()) {
      toast.error("Unit of measure is required");
      return;
    }

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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <SectionCard title="Details">
        <UnderlineInput
          label="Work Type"
          value={form.workType}
          onChange={(v) => set("workType", v)}
          placeholder="e.g. Foundation, Plastering"
          required
          autoFocus
          enterKeyHint="next"
        />
        <MobileSelectWithCreate
          label="Material"
          required
          value={form.materialId}
          onChange={(v) => set("materialId", v)}
          placeholder="— Select material —"
          options={materials.map((m) => ({
            value: m.id,
            label: `${m.name} (${m.unit})`,
          }))}
          inputClass={inputClass}
          inputStyle={inputStyle}
          labelClass={labelClass}
          labelStyle={labelStyle}
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewMaterialDialog
              open={open}
              onClose={onClose}
              categories={[]}
              onCreated={(m) => onCreated(m.id, m.name)}
            />
          )}
        />
      </SectionCard>

      {/* Consumption */}
      <SectionCard title="Consumption">
        <div
          className="grid grid-cols-3 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Std Qty"
            value={form.standardQty}
            onChange={(v) => set("standardQty", v)}
            placeholder="e.g. 1.5"
            type="number"
            min="0.001"
            step="any"
            inputMode="decimal"
            required
          />
          <div className="pl-2">
            <UnderlineInput
              label="Base Qty"
              value={form.baseQty}
              onChange={(v) => set("baseQty", v)}
              placeholder="1"
              type="number"
              min="0.001"
              step="any"
              inputMode="decimal"
            />
          </div>
          <div className="pl-2">
            <UnderlineInput
              label="Unit"
              value={form.unitOfMeasure}
              onChange={(v) => set("unitOfMeasure", v)}
              placeholder="SQM"
              required
              enterKeyHint="next"
            />
          </div>
        </div>
      </SectionCard>

      {/* Notes */}
      <SectionCard title="Notes">
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
      </SectionCard>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Adding…" : "Add Benchmark"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewStandardConsumptionDialog — legacy bottom-sheet backdrop
 * wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewStandardConsumptionForm> in
 * <MobileFabModal> instead — that gives the spring-from-FAB animation
 * matching the materials and leaves pages.
 */
export function MobileNewStandardConsumptionDialog({
  open,
  onClose,
  materials,
}: {
  open: boolean;
  onClose: () => void;
  materials: { id: string; name: string; unit: string }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Standard Consumption">
      <MobileNewStandardConsumptionForm onClose={onClose} materials={materials} />
    </MobileDialog>
  );
}
