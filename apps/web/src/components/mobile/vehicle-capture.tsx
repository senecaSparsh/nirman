"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {Camera, X, Loader2} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

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

/**
 * Reusable vehicle capture component — used on every goods movement form
 * (receive, issue, sell, transfer, return, direct purchase).
 *
 * Features:
 * - Autocomplete from existing vehicle master (by number)
 * - Photo upload (even for cycle/bike/porter)
 * - Auto-fills driver info from last trip
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
  const [suggestions, setSuggestions] = useState<Array<{
    vehicleNumber: string;
    vehicleType: string;
    driverName?: string;
    driverPhone?: string;
    transporterName?: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [blurTimeout, setBlurTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search for vehicle autocomplete
  useEffect(() => {
    if (value.vehicleNumber.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/vehicles?q=${encodeURIComponent(value.vehicleNumber)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch { /* best-effort */ }
    }, 200);
    return () => clearTimeout(t);
  }, [value.vehicleNumber]);

  function selectVehicle(v: typeof suggestions[0]) {
    haptic(5);
    onChange({
      ...value,
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      driverName: v.driverName,
      driverPhone: v.driverPhone,
      transporterName: v.transporterName,
    });
    setShowSuggestions(false);
    setSuggestions([]);
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

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const dividerStyle = { borderColor: "var(--color-line)" };

  return (
    <div className="space-y-3">
      {/* Vehicle number + type — inline label + input, full-width underline */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={dividerStyle}>
        <div className="relative pr-2">
          <div
            className="flex items-center justify-between gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="text-m-caption font-bold shrink-0" style={labelStyle}>
              Vehicle No.:
            </span>
            <input
              ref={inputRef}
              type="text"
              value={value.vehicleNumber}
              onChange={(e) => onChange({ ...value, vehicleNumber: e.target.value })}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); if (blurTimeout) clearTimeout(blurTimeout); }}
              onBlur={() => { setBlurTimeout(setTimeout(() => setShowSuggestions(false), 200)); }}
              placeholder="MH-12-AB-1234"
              className="flex-1 min-w-0 h-7 px-1 text-m-caption font-mono text-right outline-none"
              style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>
          {/* Autocomplete suggestions */}
          {showSuggestions && suggestions.length > 0 ? (
            <div className="absolute z-20 left-0 right-0 mt-0.5 rounded-[0.375rem] border shadow-lg overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              {suggestions.map((s) => (
                <button
                  key={s.vehicleNumber}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectVehicle(s); }}
                  className="w-full text-left px-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--color-signal)_8%,transparent)]"
                >
                  <div className="text-m-caption font-mono font-bold" style={{ color: "var(--color-ink-950)" }}>{s.vehicleNumber}</div>
                  <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {s.vehicleType}{s.driverName ? ` · ${s.driverName}` : ""}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="pl-2">
          <div
            className="flex items-center justify-between gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="text-m-caption font-bold shrink-0" style={labelStyle}>
              Type:
            </span>
            <select
              value={value.vehicleType}
              onChange={(e) => onChange({ ...value, vehicleType: e.target.value })}
              className="flex-1 min-w-0 h-7 px-1 text-m-caption text-right outline-none"
              style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            >
              <option value="">Select…</option>
              {VEHICLE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
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

      {/* Vehicle photo — even for cycle/bike/porter */}
      <div>
        {value.photoUrl ? (
          <div className="relative rounded-[0.375rem] overflow-hidden" style={{ height: compact ? 48 : 64, border: "1px solid var(--color-line)" }}>
            <Image src={value.photoUrl} alt="vehicle" fill className="object-cover" sizes="100px" />
            <button
              type="button"
              onClick={() => { haptic(5); onChange({ ...value, photoUrl: undefined }); }}
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
