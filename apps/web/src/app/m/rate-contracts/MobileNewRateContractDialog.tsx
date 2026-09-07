"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
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

/**
 * MobileNewRateContractForm — form content for creating a rate contract.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * rate-contracts page, or wrapped by <MobileNewRateContractDialog>
 * (legacy bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewRateContractForm({
  onClose,
  suppliers,
  materials,
}: {
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
    if (!form.supplierId) {
      toast.error("Supplier is required");
      return;
    }
    if (!form.materialId) {
      toast.error("Material is required");
      return;
    }
    if (!form.agreedRate || Number(form.agreedRate) <= 0) {
      toast.error("Agreed rate must be greater than 0");
      return;
    }
    if (!form.validFrom || !form.validTo) {
      toast.error("Valid from and to dates are required");
      return;
    }
    if (new Date(form.validTo) <= new Date(form.validFrom)) {
      toast.error("Valid-to must be after valid-from");
      return;
    }

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
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create rate contract");
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
        <MobileSelectWithCreate
          label="Supplier"
          required
          value={form.supplierId}
          onChange={(v) => set("supplierId", v)}
          placeholder="— Select supplier —"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          inputClass={inputClass}
          inputStyle={inputStyle}
          labelClass={labelClass}
          labelStyle={labelStyle}
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewSupplierDialog
              open={open}
              onClose={onClose}
              onCreated={(s) => onCreated(s.id, s.name)}
              nested
            />
          )}
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
              nested
            />
          )}
        />
      </SectionCard>

      {/* Pricing */}
      <SectionCard title="Pricing">
        <UnderlineInput
          label="Agreed Rate (₹)"
          value={form.agreedRate}
          onChange={(v) => set("agreedRate", v)}
          placeholder="0"
          type="number"
          min="0.01"
          step="any"
          inputMode="decimal"
          required
        />
      </SectionCard>

      {/* Validity */}
      <SectionCard title="Validity">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Valid From"
            value={form.validFrom}
            onChange={(v) => set("validFrom", v)}
            type="date"
            required
          />
          <div className="pl-2">
            <UnderlineInput
              label="Valid To"
              value={form.validTo}
              onChange={(v) => set("validTo", v)}
              type="date"
              required
            />
          </div>
        </div>
      </SectionCard>

      {/* Quantity Limits */}
      <SectionCard title="Quantity Limits">
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <UnderlineInput
            label="Min Qty (optional)"
            value={form.minQty}
            onChange={(v) => set("minQty", v)}
            placeholder="0"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Max Qty (optional)"
              value={form.maxQty}
              onChange={(v) => set("maxQty", v)}
              placeholder="0"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
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
            placeholder="Additional terms…"
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
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Creating…" : "Create Contract"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewRateContractDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewRateContractForm> in <MobileFabModal>
 * instead — that gives the spring-from-FAB animation matching the
 * materials and leaves pages.
 */
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Rate Contract">
      <MobileNewRateContractForm
        onClose={onClose}
        suppliers={suppliers}
        materials={materials}
      />
    </MobileDialog>
  );
}
