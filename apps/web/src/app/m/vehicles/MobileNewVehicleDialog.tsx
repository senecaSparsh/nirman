"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Vehicle Details
        </p>

        {/* Vehicle Number + Type */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>
              Vehicle Number <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.vehicleNumber}
              onChange={(e) => set("vehicleNumber", e.target.value)}
              placeholder="e.g. MH-12-AB-1234"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              Type
            </label>
            <select
              value={form.vehicleType}
              onChange={(e) => set("vehicleType", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              {VEHICLE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Driver / Carrier */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Driver / Carrier (optional)
        </p>

        <div>
          <label className={labelClass} style={labelStyle}>
            Driver Name
          </label>
          <input
            type="text"
            value={form.driverName}
            onChange={(e) => set("driverName", e.target.value)}
            placeholder="e.g. Ramesh"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>
              Driver Phone
            </label>
            <input
              type="tel"
              value={form.driverPhone}
              onChange={(e) => set("driverPhone", e.target.value)}
              placeholder="e.g. 9876543210"
              inputMode="tel"
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              Transporter
            </label>
            <input
              type="text"
              value={form.transporterName}
              onChange={(e) => set("transporterName", e.target.value)}
              placeholder="e.g. ABC Transport"
              enterKeyHint="done"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
        }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {saving ? "Creating…" : "Create Vehicle"}
      </button>
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
