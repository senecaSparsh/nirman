"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {Camera, X, Loader2, Plus} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { EnumSelect, SelectorModal } from "@/components/mobile/v2/form-primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

export const VEHICLE_TYPE_OPTIONS = [
  { value: "TRUCK", label: "Truck" },
  { value: "TEMPO", label: "Tempo" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TRACTOR", label: "Tractor" },
  { value: "MINI_TRUCK", label: "Mini Truck" },
  { value: "AUTO", label: "Auto" },
  { value: "CAR", label: "Car" },
  { value: "BIKE", label: "Bike" },
  { value: "CYCLE", label: "Cycle" },
  { value: "HAND_CART", label: "Hand Cart" },
  { value: "PORTER", label: "Porter (shoulder)" },
  { value: "OTHER", label: "Other" },
];

export interface VehicleData {
  vehicleNumber: string;
  vehicleType: string;
  photoUrl?: string;
  driverName?: string;
  driverPhone?: string;
  transporterName?: string;
}

type VehicleListItem = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  driverName?: string | null;
  driverPhone?: string | null;
  transporterName?: string | null;
};

/**
 * Reusable vehicle capture component — used on every goods movement form
 * (receive, issue, sell, transfer, return, direct purchase).
 *
 * Features:
 * - Selector with create: tap to open a searchable bottom-sheet of existing
 *   vehicles; "+ Create new" lets the user type a new number inline
 * - Photo upload (even for cycle/bike/porter)
 * - Auto-fills driver info from last trip when an existing vehicle is selected
 * - Compact for mobile
 */
export function VehicleCapture({
  value,
  onChange,
  compact = false,
}: {
  value: VehicleData;
  onChange: (v: VehicleData) => void;
  compact?: boolean;
}) {
  const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showCreateVehicle, setShowCreateVehicle] = useState(false);
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showCreateType, setShowCreateType] = useState(false);
  const [customType, setCustomType] = useState("");

  // Fetch all vehicles for the company (for the selector modal)
  useEffect(() => {
    let cancelled = false;
    setLoadingVehicles(true);
    fetch("/api/vehicles")
      .then((r) => r.ok ? r.json() : [])
      .then((data: VehicleListItem[]) => {
        if (!cancelled) setVehicles(data);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingVehicles(false); });
    return () => { cancelled = true; };
  }, []);

  function selectVehicle(v: VehicleListItem) {
    haptic(5);
    onChange({
      ...value,
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      driverName: v.driverName ?? value.driverName,
      driverPhone: v.driverPhone ?? value.driverPhone,
      transporterName: v.transporterName ?? value.transporterName,
    });
    setShowPicker(false);
  }

  function handleCreateNew() {
    const trimmed = newVehicleNumber.trim().toUpperCase();
    if (!trimmed) {
      toast.error("Enter a vehicle number");
      return;
    }
    haptic([10, 40, 80]);
    onChange({ ...value, vehicleNumber: trimmed });
    // Add to local list so it appears in future searches
    setVehicles((prev) => {
      if (prev.some((v) => v.vehicleNumber.toUpperCase() === trimmed)) return prev;
      return [...prev, {
        id: `local-${trimmed}`,
        vehicleNumber: trimmed,
        vehicleType: value.vehicleType || "OTHER",
        driverName: value.driverName ?? null,
        driverPhone: value.driverPhone ?? null,
        transporterName: value.transporterName ?? null,
      }];
    });
    setShowCreateVehicle(false);
    setNewVehicleNumber("");
    toast.success(`Vehicle ${trimmed} added`);
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      haptic(5);
      onChange({ ...value, photoUrl: data.url });
    } catch {
      toast.error("Failed to upload vehicle photo");
    } finally {
      setUploading(false);
    }
  }

  const labelStyle = { color: "var(--color-ink-700)" };
  const dividerStyle = { borderColor: "var(--color-line)" };

  // Build items for the SelectorModal
  const vehicleItems = vehicles.map((v) => ({
    id: v.vehicleNumber,
    label: v.vehicleNumber,
    sub: `${v.vehicleType.replace(/_/g, " ").toLowerCase()}${v.driverName ? ` · ${v.driverName}` : ""}`,
  }));

  return (
    <div className="flex flex-col gap-3">
      {/* Vehicle Details */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Vehicle Details
        </p>
        {/* Vehicle number (selector) + type — side by side */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={dividerStyle}>
        <div className="pr-2">
          <label className="block text-m-caption font-bold mb-0" style={labelStyle}>
            Vehicle No.
          </label>
          <button
            type="button"
            onClick={() => { haptic(10); setShowPicker(true); }}
            className="w-full h-7 px-1 text-m-caption font-mono text-left outline-none border-b focus:border-b-2 transition-colors press truncate"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "transparent",
              color: value.vehicleNumber ? "var(--color-ink-950)" : "var(--color-ink-500)",
            }}
          >
            {value.vehicleNumber || "— Select —"}
          </button>
          {/* Quick clear button when a vehicle is selected */}
          {value.vehicleNumber && (
            <button
              type="button"
              onClick={() => { haptic(5); onChange({ ...value, vehicleNumber: "", driverName: "", driverPhone: "" }); }}
              className="text-m-caption font-bold press mt-0.5"
              style={{ color: "var(--color-ink-500)" }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="pl-2">
          <EnumSelect
            label="Type:"
            value={value.vehicleType}
            onChange={(v) => onChange({ ...value, vehicleType: v })}
            placeholder="Select…"
            options={VEHICLE_TYPE_OPTIONS}
            inline
            align="right"
            onCreate={() => {
              setCustomType("");
              setShowCreateType(true);
            }}
            createLabel="Create new type"
          />
        </div>
      </div>

      {/* Driver + phone — inline label + input, full-width underline */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={dividerStyle}>
        <div className="pr-2">
          <div
            className="flex items-center justify-between gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="text-m-caption font-bold shrink-0" style={labelStyle}>
              Driver:
            </span>
            <input
              type="text"
              value={value.driverName ?? ""}
              onChange={(e) => onChange({ ...value, driverName: e.target.value })}
              placeholder="Name"
              className="flex-1 min-w-0 h-7 px-1 text-m-caption text-right outline-none"
              style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>
        <div className="pl-2">
          <div
            className="flex items-center justify-between gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="text-m-caption font-bold shrink-0" style={labelStyle}>
              Phone:
            </span>
            <input
              type="tel"
              value={value.driverPhone ?? ""}
              onChange={(e) => onChange({ ...value, driverPhone: e.target.value })}
              placeholder="Number"
              className="flex-1 min-w-0 h-7 px-1 text-m-caption text-right outline-none"
              style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>
      </div>
      </div>

      {/* Vehicle Photo */}
      <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Vehicle Photo
        </p>
      {/* Vehicle photo — even for cycle/bike/porter */}
      <div>
        {value.photoUrl ? (
          <div className="relative rounded-[0.375rem] overflow-hidden" style={{ height: compact ? 48 : 64, border: "1px solid var(--color-line)" }}>
            <Image src={value.photoUrl} alt="vehicle" fill className="object-cover" sizes="100px" />
            <button
              type="button"
              onClick={() => { haptic(5); onChange({ ...value, photoUrl: undefined }); }}
              aria-label="Clear photo"
              className="absolute top-1 right-1 grid place-items-center size-5 rounded-full"
              style={{ backgroundColor: "var(--color-ink-950)" }}
            >
              <X className="size-3" style={{ color: "var(--color-paper)" }} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 60%, transparent)" }}>
              <span className="text-m-caption font-semibold" style={{ color: "var(--color-paper)" }}>✓ Vehicle photo</span>
            </div>
          </div>
        ) : (
          <VehiclePhotoButton uploading={uploading} onUpload={handlePhotoUpload} compact={compact} />
        )}
      </div>
      </div>

      {/* ══ Vehicle selector modal (searchable list + create new) ══ */}
      {showPicker ? (
        <SelectorModal
          title="Select Vehicle"
          items={loadingVehicles ? [{ id: "", label: "Loading…", sub: undefined }] : vehicleItems}
          selectedId={value.vehicleNumber}
          onSelect={(id) => {
            const v = vehicles.find((v) => v.vehicleNumber === id);
            if (v) selectVehicle(v);
            else setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
          onCreate={() => { setShowPicker(false); setShowCreateVehicle(true); setNewVehicleNumber(""); }}
          createLabel="Create new vehicle"
        />
      ) : null}

      {/* ══ Create new vehicle dialog (type a new number) ══ */}
      <MobileDialog
        open={showCreateVehicle}
        onClose={() => setShowCreateVehicle(false)}
        title="New Vehicle"
        nested
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleCreateNew(); }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Vehicle Number <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={newVehicleNumber}
              onChange={(e) => setNewVehicleNumber(e.target.value.toUpperCase())}
              placeholder="MH-12-AB-1234"
              autoFocus
              className="w-full h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
              Or use a descriptive name for non-registered vehicles (e.g. CYCLE-01, PORTER-RAMU)
            </p>
          </div>
          <div className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-4" />
              Add Vehicle
            </button>
          </div>
        </form>
      </MobileDialog>

      {/* Create new vehicle type dialog */}
      <MobileDialog
        open={showCreateType}
        onClose={() => setShowCreateType(false)}
        title="New Vehicle Type"
        nested
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = customType.trim();
            if (!trimmed) {
              toast.error("Enter a vehicle type name");
              return;
            }
            const code = trimmed.toUpperCase().replace(/\s+/g, "_");
            haptic([10, 40, 80]);
            onChange({ ...value, vehicleType: code });
            setShowCreateType(false);
            setCustomType("");
            toast.success(`Vehicle type "${code}" added`);
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Type name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="e.g. Eicher, JCB, Tipper"
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
          <div className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-4" />
              Add Type
            </button>
          </div>
        </form>
      </MobileDialog>
    </div>
  );
}

function VehiclePhotoButton({ uploading, onUpload, compact }: { uploading: boolean; onUpload: (f: File) => void; compact: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full ${compact ? "h-8" : "h-9"} rounded-[0.375rem] border-2 border-dashed flex items-center justify-center gap-1.5 press`}
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
      >
        {uploading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <>
            <Camera className="size-3" />
            <span className="text-m-caption font-semibold">Upload vehicle photo</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
