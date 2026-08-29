"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";

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

export const EMPTY_VEHICLE: VehicleData = { vehicleNumber: "", vehicleType: "" };

/**
 * Desktop vehicle capture section — used on every goods movement form
 * (issue, sale, receive, transfer) for transport tracking and theft/misplacement tracing.
 *
 * Features:
 * - Autocomplete from existing vehicle master (by number)
 * - Photo upload (even for cycle/bike/porter)
 * - Auto-fills driver info from last trip
 * - Uses shadcn-style primitives for desktop consistency
 */
export function VehicleCaptureSection({
  value,
  onChange,
}: {
  value: VehicleData;
  onChange: (v: VehicleData) => void;
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
      onChange({ ...value, photoUrl: data.url });
    } catch {
      toast.error("Failed to upload vehicle photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        Vehicle & Driver Details
      </div>

      {/* Vehicle number + type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Field label="Vehicle Number">
            <input
              ref={inputRef}
              type="text"
              value={value.vehicleNumber}
              onChange={(e) => onChange({ ...value, vehicleNumber: e.target.value })}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); if (blurTimeout) clearTimeout(blurTimeout); }}
              onBlur={() => { setBlurTimeout(setTimeout(() => setShowSuggestions(false), 200)); }}
              placeholder="MH-12-AB-1234"
              className="w-full h-11 rounded-md border border-input bg-card text-foreground px-3 text-[14px] font-mono transition-[border-color,box-shadow] duration-100 placeholder:text-faint hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 sm:h-8 sm:px-2.5 sm:text-[13px]"
            />
            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 ? (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <button
                    key={s.vehicleNumber}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectVehicle(s); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-muted/60"
                  >
                    <div className="text-body font-mono font-semibold">{s.vehicleNumber}</div>
                    <div className="text-caption text-muted-foreground">
                      {s.vehicleType}{s.driverName ? ` · ${s.driverName}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
        </div>
        <Field label="Vehicle Type">
          <Select
            value={value.vehicleType}
            onChange={(e) => onChange({ ...value, vehicleType: e.target.value })}
          >
            <option value="">Select…</option>
            {VEHICLE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Driver + phone */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Driver Name">
          <Input
            type="text"
            value={value.driverName ?? ""}
            onChange={(e) => onChange({ ...value, driverName: e.target.value })}
            placeholder="Driver name"
          />
        </Field>
        <Field label="Driver Phone">
          <Input
            type="tel"
            value={value.driverPhone ?? ""}
            onChange={(e) => onChange({ ...value, driverPhone: e.target.value })}
            placeholder="Driver phone"
            maxLength={20}
          />
        </Field>
      </div>

      {/* Vehicle photo — even for cycle/bike/porter */}
      <div>
        <Label className="mb-1.5 block">Vehicle Photo</Label>
        {value.photoUrl ? (
          <div className="relative rounded-md overflow-hidden border border-border" style={{ height: 80, maxWidth: 160 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.photoUrl} alt="vehicle" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange({ ...value, photoUrl: undefined })}
              className="absolute top-1 right-1 grid place-items-center size-5 rounded-full bg-foreground/80 hover:bg-foreground"
            >
              <X className="size-3 text-background" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60">
              <span className="text-caption font-semibold text-white">Vehicle photo</span>
            </div>
          </div>
        ) : (
          <VehiclePhotoButton uploading={uploading} onUpload={handlePhotoUpload} />
        )}
      </div>
    </div>
  );
}

function VehiclePhotoButton({ uploading, onUpload }: { uploading: boolean; onUpload: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-11 sm:h-8 border-dashed"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Camera className="h-3.5 w-3.5" />
            <span className="text-body">Upload vehicle photo</span>
          </>
        )}
      </Button>
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
