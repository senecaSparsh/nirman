"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * MobileChequeFields — compact cheque detail sub-form for mobile modals.
 *
 * Uses inline styles matching the mobile design system (var(--color-*)).
 * Shown when payment mode is "CHEQUE". Captures cheque number, date, bank,
 * and an optional photo of the cheque (front side).
 */
export interface MobileChequeState {
  chequeNo: string;
  chequeDate: string;
  chequeBank: string;
  chequePhotoUrl: string;
}

export const EMPTY_MOBILE_CHEQUE: MobileChequeState = {
  chequeNo: "",
  chequeDate: "",
  chequeBank: "",
  chequePhotoUrl: "",
};

export function MobileChequeFields({
  value,
  onChange,
}: {
  value: MobileChequeState;
  onChange: (v: MobileChequeState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function set<K extends keyof MobileChequeState>(key: K, v: MobileChequeState[K]) {
    onChange({ ...value, [key]: v });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      set("chequePhotoUrl", data.url);
      toast.success("Cheque photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload cheque photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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

  return (
    <div className="space-y-3 pt-1">
      <p className="text-m-caption font-bold" style={{ color: "var(--color-signal)" }}>
        Cheque Details — pending until cleared
      </p>

      {/* Cheque No + Date */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <div className="pr-2">
          <label className={labelClass} style={labelStyle}>
            Cheque No.
          </label>
          <input
            type="text"
            value={value.chequeNo}
            onChange={(e) => set("chequeNo", e.target.value)}
            placeholder="000123"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="pl-2">
          <label className={labelClass} style={labelStyle}>
            Cheque Date
          </label>
          <input
            type="date"
            value={value.chequeDate}
            onChange={(e) => set("chequeDate", e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Bank */}
      <div>
        <label className={labelClass} style={labelStyle}>
          Bank
        </label>
        <input
          type="text"
          value={value.chequeBank}
          onChange={(e) => set("chequeBank", e.target.value)}
          placeholder="HDFC, SBI, ICICI…"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      {/* Cheque photo */}
      <div>
        <label className={labelClass} style={labelStyle}>
          Cheque Photo (front)
        </label>
        {value.chequePhotoUrl ? (
          <div className="relative h-24 rounded-[0.375rem] border overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
            <Image src={value.chequePhotoUrl} alt="Cheque" fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
            <button
              type="button"
              onClick={() => set("chequePhotoUrl", "")}
              className="absolute top-1 right-1 rounded-full p-1 text-m-body press"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 70%, transparent)" }}
            >
              <X className="size-3" style={{ color: "var(--color-paper)" }} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.375rem] border border-dashed py-3 text-m-body press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
            ) : (
              <Camera className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            )}
            <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-500)" }}>
              {uploading ? "Uploading…" : "Upload Cheque Photo"}
            </span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
      </div>
    </div>
  );
}
