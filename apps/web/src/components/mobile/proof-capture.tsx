"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Camera, X, CheckCircle2, MapPin, RefreshCw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/* ═══════════════════════════════════════════════════════════
 * PhotoCapture — mandatory proof-of-delivery photos
 * Uses file input with accept="image/*" + capture="environment"
 * for mobile camera access. Uploads to /api/uploads.
 * ═══════════════════════════════════════════════════════════ */
export function PhotoCapture({
  photos,
  onChange,
  mandatory,
  compact,
}: {
  photos: { url: string; fileName?: string }[];
  onChange: (photos: { url: string; fileName?: string }[]) => void;
  mandatory?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      haptic(5);
      onChange([...photos, { url: data.url, fileName: file.name }]);
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(idx: number) {
    haptic(5);
    onChange(photos.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        Photos {mandatory ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
        {mandatory && photos.length === 0 ? (
          <span className="ml-1 normal-case" style={{ color: "var(--color-stop)" }}>1 req</span>
        ) : null}
      </label>
      <div className={compact ? "flex gap-1 flex-wrap rounded-[0.5rem] border-2 border-dashed" : "flex gap-1.5 flex-wrap"} style={compact ? { borderColor: "var(--color-line)", height: "84px", padding: "4px" } : undefined}>
        {photos.map((p, i) => (
          <div key={i} className={compact ? "relative size-14 rounded-[0.375rem] overflow-hidden shrink-0" : "relative size-20 rounded-[0.375rem] overflow-hidden shrink-0"} style={{ border: "1px solid var(--color-line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.fileName ?? "proof"} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute top-0.5 right-0.5 grid place-items-center size-4 rounded-full"
              style={{ backgroundColor: "var(--color-ink-950)" }}
            >
              <X className="size-2.5" style={{ color: "#fff" }} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={compact ? "flex-1 flex flex-col items-center justify-center gap-0.5 press" : "size-20 rounded-[0.375rem] border-2 border-dashed flex flex-col items-center justify-center gap-1 press shrink-0"}
          style={compact ? { color: "var(--color-ink-500)" } : { borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
        >
          {uploading ? (
            <Loader2 className={compact ? "size-4 animate-spin" : "size-5 animate-spin"} />
          ) : (
            <>
              <Camera className={compact ? "size-4" : "size-5"} />
              <span className="text-[0.4375rem] font-semibold">{compact ? "Photo" : "Add Photo"}</span>
            </>
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * SignaturePad — e-signature canvas for receiver accountability
 * Draws on a <canvas>, exports as base64 PNG.
 * ═══════════════════════════════════════════════════════════ */
export function SignaturePad({
  value,
  onChange,
  mandatory,
  compact,
}: {
  value: string | null;
  onChange: (sig: string | null) => void;
  mandatory?: boolean;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(!!value);

  useEffect(() => {
    if (value && !hasSigned) setHasSigned(true);
  }, [value, hasSigned]);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Set canvas size to match display size * dpr for crisp lines
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "var(--color-ink-950)";
    return ctx;
  }

  function startDraw(e: React.PointerEvent) {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setDrawing(true);
  }

  function draw(e: React.PointerEvent) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    setHasSigned(true);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
      haptic(5);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSigned(false);
    onChange(null);
    haptic(5);
  }

  return (
    <div className={compact ? "flex flex-col" : ""}>
      <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {compact ? "Signature" : "Receiver Signature"} {mandatory ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
      </label>
      <div className="relative rounded-[0.5rem] border" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}>
        <canvas
          ref={canvasRef}
          className="w-full block touch-none"
          style={{ height: compact ? "84px" : "120px" }}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
        {!hasSigned ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[0.5rem]" style={{ color: "var(--color-ink-300)" }}>
              {compact ? "Sign here" : "Sign here with your finger"}
            </span>
          </div>
        ) : null}
      </div>
      {hasSigned ? (
        <button
          type="button"
          onClick={clear}
          className="mt-1 flex items-center gap-1 text-[0.5rem] font-semibold press"
          style={{ color: "var(--color-ink-500)" }}
        >
          <RefreshCw className="size-3" />
          Clear
        </button>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * GeoTagCapture — captures GPS coordinates at receipt time
 * Uses navigator.geolocation.getCurrentPosition().
 * ═══════════════════════════════════════════════════════════ */
export function GeoTagCapture({
  lat,
  lng,
  location,
  onChange,
  mandatory,
}: {
  lat: number | null;
  lng: number | null;
  location: string | null;
  onChange: (geo: { lat: number; lng: number; location?: string }) => void;
  mandatory?: boolean;
}) {
  const [capturing, setCapturing] = useState(false);

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        haptic(5);
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          location: location ?? undefined,
        });
        setCapturing(false);
      },
      (err) => {
        toast.error(`GPS capture failed: ${err.message}`);
        setCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [onChange, location]);

  const captured = lat !== null && lng !== null;

  return (
    <div>
      <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        Geo-tag {mandatory ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
      </label>
      <button
        type="button"
        onClick={capture}
        disabled={capturing}
        className="w-full flex items-center gap-2 rounded-[0.5rem] border py-2.5 px-3 press"
        style={{
          borderColor: captured ? "var(--color-go)" : "var(--color-line)",
          backgroundColor: captured ? "color-mix(in srgb, var(--color-go) 5%, transparent)" : "var(--color-paper)",
        }}
      >
        {capturing ? (
          <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        ) : captured ? (
          <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
        ) : (
          <MapPin className="size-4 shrink-0" style={{ color: "var(--color-signal-dark)" }} />
        )}
        <span className="text-[0.625rem] font-semibold text-left flex-1" style={{ color: captured ? "var(--color-ink-700)" : "var(--color-ink-500)" }}>
          {capturing ? "Capturing GPS…" : captured ? `${lat!.toFixed(6)}, ${lng!.toFixed(6)}` : "Capture GPS location"}
        </span>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * SelectField — compact select dropdown for delivery mode, vehicle type
 * ═══════════════════════════════════════════════════════════ */
export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--color-ink-500)" }}>
        {label} {required ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.6875rem] font-semibold outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper-2)",
          color: "var(--color-ink-950)",
        }}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * TextField — compact text input
 * ═══════════════════════════════════════════════════════════ */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[0.5rem] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--color-ink-500)" }}>
        {label} {required ? <span style={{ color: "var(--color-stop)" }}>*</span> : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.6875rem] outline-none ${mono ? "font-mono" : ""}`}
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper-2)",
          color: "var(--color-ink-950)",
        }}
      />
    </div>
  );
}

/* ── Shared option constants ── */
export const DELIVERY_MODES = [
  { value: "SUPPLIER_VEHICLE", label: "Supplier" },
  { value: "OWN_VEHICLE", label: "Own Vehicle" },
  { value: "THIRD_PARTY", label: "3rd Party" },
  { value: "HAND_CARRY", label: "Hand Carry" },
];

export const VEHICLE_TYPES = [
  { value: "TRUCK", label: "Truck" },
  { value: "TEMPO", label: "Tempo" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TRACTOR", label: "Tractor" },
  { value: "HAND_CART", label: "Hand Cart" },
  { value: "OTHER", label: "Other" },
];

export const INSPECTION_STATUSES = [
  { value: "PASSED", label: "Passed" },
  { value: "FAILED", label: "Failed" },
  { value: "RETEST", label: "Retest" },
  { value: "PENDING", label: "Pending" },
];

/* ═══════════════════════════════════════════════════════════
 * WeighbridgeFields — gross/tare/net weight for bulk materials
 * Auto-calculates netWeight = grossWeight - tareWeight
 * ═══════════════════════════════════════════════════════════ */
export function WeighbridgeFields({
  ticketNo, onTicketNoChange,
  grossWeight, onGrossChange,
  tareWeight, onTareChange,
  netWeight, onNetChange,
  required = false,
}: {
  ticketNo: string;
  onTicketNoChange: (v: string) => void;
  grossWeight: string;
  onGrossChange: (v: string) => void;
  tareWeight: string;
  onTareChange: (v: string) => void;
  netWeight: string;
  onNetChange: (v: string) => void;
  required?: boolean;
}) {
  function calcNet(gross: string, tare: string) {
    const g = Number(gross);
    const t = Number(tare);
    // Only calculate when both values are valid numbers
    if (gross !== "" && tare !== "" && !isNaN(g) && !isNaN(t)) {
      const net = g - t;
      if (net < 0) {
        toast.error("Tare weight cannot exceed gross weight");
        onNetChange("");
        return;
      }
      onNetChange(String(net));
    } else {
      // Clear net if either field is empty/invalid
      onNetChange("");
    }
  }

  const reqColor = "var(--color-stop)";
  const labelColor = required ? reqColor : "var(--color-ink-500)";

  return (
    <div className="grid grid-cols-4 gap-1.5">
      <div>
        <label className="text-[0.4375rem] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: labelColor }}>
          Slip No{required ? " *" : ""}
        </label>
        <input type="text" value={ticketNo} onChange={(e) => onTicketNoChange(e.target.value)} placeholder="KP-001" className="w-full h-8 rounded-[0.375rem] border px-1.5 text-[0.5rem] font-mono outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
      </div>
      <div>
        <label className="text-[0.4375rem] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: labelColor }}>
          Gross{required ? " *" : ""}
        </label>
        <input type="number" inputMode="decimal" step="0.001" value={grossWeight} onChange={(e) => { onGrossChange(e.target.value); calcNet(e.target.value, tareWeight); }} placeholder="0" className="w-full h-8 rounded-[0.375rem] border px-1 text-[0.5rem] text-right tabular-nums outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
      </div>
      <div>
        <label className="text-[0.4375rem] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: labelColor }}>
          Tare{required ? " *" : ""}
        </label>
        <input type="number" inputMode="decimal" step="0.001" value={tareWeight} onChange={(e) => { onTareChange(e.target.value); calcNet(grossWeight, e.target.value); }} placeholder="0" className="w-full h-8 rounded-[0.375rem] border px-1 text-[0.5rem] text-right tabular-nums outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }} />
      </div>
      <div>
        <label className="text-[0.4375rem] font-semibold uppercase tracking-wide block mb-0.5" style={{ color: "var(--color-go)" }}>Net (kg)</label>
        <input type="number" readOnly value={netWeight} placeholder="0" className="w-full h-8 rounded-[0.375rem] border px-1 text-[0.5rem] text-right tabular-nums font-bold outline-none" style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 5%, transparent)", color: "var(--color-ink-950)" }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * GeoFenceStatus — shows geo-fence validation result
 * ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
 * ReceivingPhotoUpload — single photo upload for the company's
 * receiving acknowledgment (when there's no formal gate pass).
 * Used for small/informal deliveries (chota-mota kaam).
 * ═══════════════════════════════════════════════════════════ */
export function ReceivingPhotoUpload({
  photo,
  onChange,
}: {
  photo: { url: string; fileName?: string } | null;
  onChange: (photo: { url: string; fileName?: string } | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      haptic(5);
      onChange({ url: data.url, fileName: file.name });
    } catch {
      toast.error("Failed to upload receiving photo");
    } finally {
      setUploading(false);
    }
  }

  if (photo) {
    return (
      <div className="relative rounded-[0.375rem] overflow-hidden h-8" style={{ border: "1px solid var(--color-line)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="receiving" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => { haptic(5); onChange(null); }}
          className="absolute top-0.5 right-0.5 grid place-items-center size-4 rounded-full"
          style={{ backgroundColor: "var(--color-ink-950)" }}
        >
          <X className="size-2.5" style={{ color: "#fff" }} />
        </button>
        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <span className="text-[0.4375rem] font-semibold text-white truncate">✓ Receiving photo</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-8 rounded-[0.25rem] border-2 border-dashed flex items-center justify-center gap-1 press"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
      >
        {uploading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <>
            <Camera className="size-3" />
            <span className="text-[0.5rem] font-semibold">Upload receiving photo</span>
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
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function GeoFenceStatus({ ok, distance }: { ok: boolean; distance?: number }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-[0.375rem] px-2 py-1"
      style={{
        backgroundColor: ok ? "color-mix(in srgb, var(--color-go) 8%, transparent)" : "color-mix(in srgb, var(--color-stop) 8%, transparent)",
      }}
    >
      <MapPin className="size-3" style={{ color: ok ? "var(--color-go)" : "var(--color-stop)" }} />
      <span className="text-[0.5rem] font-semibold" style={{ color: ok ? "var(--color-go)" : "var(--color-stop)" }}>
        {ok ? "On-site" : `Off-site${distance != null ? ` (${distance}m away)` : ""}`}
      </span>
    </div>
  );
}
