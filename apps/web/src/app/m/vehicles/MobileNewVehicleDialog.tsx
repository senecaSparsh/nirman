"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";

const VEHICLE_TYPE_OPTIONS = [
  { value: "TRUCK", label: "Truck (16-wheeler)" },
  { value: "TEMPO", label: "Tempo" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TRACTOR", label: "Tractor Trolley" },
  { value: "MINI_TRUCK", label: "Mini Truck" },
  { value: "AUTO", label: "Auto Rickshaw" },
  { value: "CAR", label: "Car" },
  { value: "BIKE", label: "Bike" },
  { value: "CYCLE", label: "Cycle" },
  { value: "HAND_CART", label: "Hand Cart" },
  { value: "PORTER", label: "Porter (on shoulder)" },
  { value: "OTHER", label: "Other" },
] as const;

interface FormState {
  vehicleNumber: string;
  vehicleType: string;
  driverName: string;
  driverPhone: string;
  transporterName: string;
}

/**
 * MobileNewVehicleForm — form content for manually creating a Vehicle
 * master record from the mobile vehicles page.
 *
 * Vehicles normally auto-build from goods movements (recordVehicleTrip),
 * but the owner can pre-register a vehicle here before its first trip.
 * Mirrors MobileNewUnitForm / MobileNewMaterialForm styling.
 *
 * No header or Cancel button — the wrapper (<MobileFabModal>) supplies
 * the title and close affordance.
 */
export function MobileNewVehicleForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    vehicleNumber: "",
    vehicleType: "TRUCK",
    driverName: "",
    driverPhone: "",
    transporterName: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicleNumber.trim()) {
      toast.error("Vehicle number is required");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleNumber: form.vehicleNumber.trim(),
          vehicleType: form.vehicleType,
          driverName: form.driverName.trim() || null,
          driverPhone: form.driverPhone.trim() || null,
          transporterName: form.transporterName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create vehicle");
      haptic([10, 40, 80]);
      toast.success(`Vehicle ${form.vehicleNumber.trim().toUpperCase()} created`);
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <SectionCard title="Vehicle Details">
        {/* Vehicle Number + Type */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Vehicle Number"
            value={form.vehicleNumber}
            onChange={(v) => set("vehicleNumber", v)}
            placeholder="e.g. MH-12-AB-1234"
            required
            autoFocus
            enterKeyHint="next"
          />
          <EnumSelect
            label="Type"
            value={form.vehicleType}
            onChange={(v) => set("vehicleType", v)}
            options={VEHICLE_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
      </SectionCard>

      {/* Driver / Carrier */}
      <SectionCard title="Driver / Carrier (optional)">
        <UnderlineInput
          label="Driver Name"
          value={form.driverName}
          onChange={(v) => set("driverName", v)}
          placeholder="e.g. Ramesh"
          enterKeyHint="next"
        />

        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Driver Phone"
            value={form.driverPhone}
            onChange={(v) => set("driverPhone", v)}
            placeholder="e.g. 9876543210"
            type="tel"
            inputMode="tel"
            enterKeyHint="next"
          />
          <UnderlineInput
            label="Transporter"
            value={form.transporterName}
            onChange={(v) => set("transporterName", v)}
            placeholder="e.g. ABC Transport"
            enterKeyHint="done"
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
            {saving ? "Creating…" : "Create Vehicle"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewVehicleDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewVehicleForm> in <MobileFabModal> instead.
 */
export function MobileNewVehicleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Vehicle">
      <MobileNewVehicleForm onClose={onClose} />
    </MobileDialog>
  );
}
