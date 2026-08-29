"use client";

import { useRef, useState } from "react";
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
    } catch {
      toast.error("Failed to upload cheque photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className="rounded-[0.375rem] border p-2.5 space-y-2"
      style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-signal) 5%, var(--color-paper))" }}
    >
      <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-signal)" }}>
        Cheque Details — pending until cleared
      </p>

      {/* Cheque No + Date */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
            Cheque No.
          </label>
          <input
            type="text"
            value={value.chequeNo}
            onChange={(e) => set("chequeNo", e.target.value)}
            placeholder="000123"
            className="w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          />
        </div>
        <div>
          <label className="text-m-caption font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
            Cheque Date
          </label>
          <input
            type="date"
            value={value.chequeDate}
            onChange={(e) => set("chequeDate", e.target.value)}
            className="w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          />
        </div>
      </div>

      {/* Bank */}
      <div>
        <label className="text-m-caption font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
          Bank
        </label>
        <input
          type="text"
          value={value.chequeBank}
          onChange={(e) => set("chequeBank", e.target.value)}
          placeholder="HDFC, SBI, ICICI…"
          className="w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body outline-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        />
      </div>

      {/* Cheque photo */}
      <div>
        <label className="text-m-caption font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
          Cheque Photo (front)
        </label>
        {value.chequePhotoUrl ? (
          <div className="relative rounded-[0.375rem] border overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
            <img src={value.chequePhotoUrl} alt="Cheque" className="w-full h-24 object-cover" />
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
