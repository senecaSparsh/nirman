"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * MobileDocUploader — compact single-file uploader for documents (ATS, BBA, Registry).
 *
 * Shows the uploaded file as a link with a remove/replace option.
 * Uses inline styles matching the mobile design system.
 */
export function MobileDocUploader({
  url,
  fileName,
  onUpload,
  onRemove,
  label = "Upload Document",
  required = false,
}: {
  url: string;
  fileName?: string | null;
  onUpload: (url: string, fileName: string) => void;
  onRemove?: () => void;
  label?: string;
  required?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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
      onUpload(data.url, file.name ?? "");
      toast.success("Document uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (url) {
    return (
      <div className="flex items-center gap-2 rounded-[0.375rem] border px-2.5 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <FileText className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 flex-1 min-w-0 text-m-caption font-bold text-m-body press"
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{fileName ?? "View Document"}</span>
          <ExternalLink className="size-2.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
        </a>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-0.5 text-m-body press shrink-0"
            style={{ color: "var(--color-stop)" }}
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center gap-1.5 w-full rounded-[0.375rem] border border-dashed py-2.5 text-m-body press disabled:opacity-50"
        style={{ borderColor: required ? "color-mix(in srgb, var(--color-signal) 40%, var(--color-line))" : "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        ) : (
          <Camera className="size-3.5" style={{ color: required ? "var(--color-signal)" : "var(--color-ink-500)" }} />
        )}
        <span className="text-m-caption font-bold" style={{ color: required ? "var(--color-signal)" : "var(--color-ink-500)" }}>
          {uploading ? "Uploading…" : label}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
    </>
  );
}
