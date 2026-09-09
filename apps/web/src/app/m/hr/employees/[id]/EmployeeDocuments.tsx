"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Image as ImageIcon, Loader2, Upload, X, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type Attachment = {
  id: string;
  category: string;
  label: string | null;
  createdAt: string;
  upload: {
    id: string;
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
  };
};

/**
 * Document types HR can upload for an employee during onboarding.
 * Each slot is a specific document category with a label and accepted file types.
 */
const DOCUMENT_TYPES = [
  { category: "pan-card", label: "PAN Card", required: true },
  { category: "aadhaar-card", label: "Aadhaar Card", required: true },
  { category: "bank-proof", label: "Bank Proof", required: true },
  { category: "photo", label: "Passport Photo", required: true },
  { category: "resume", label: "Resume / CV", required: false },
  { category: "education-certificate", label: "Education Certificate", required: false },
  { category: "experience-certificate", label: "Experience Certificate", required: false },
  { category: "address-proof", label: "Address Proof", required: false },
  { category: "medical-certificate", label: "Medical Certificate", required: false },
  { category: "previous-relieving", label: "Previous Relieving Letter", required: false },
  { category: "other", label: "Other Document", required: false },
] as const;

/**
 * EmployeeDocuments — categorized document uploader for the onboarding Dossier tab.
 *
 * Shows specific document type slots (PAN, Aadhaar, bank proof, etc.) with
 * image/PDF upload support. Each slot shows whether a document has been uploaded
 * and lets HR upload, view, or replace it.
 */
export function EmployeeDocuments({
  employeeId,
  canManage,
}: {
  employeeId: string;
  canManage: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments?entityType=Employee&entityId=${employeeId}`);
      const data = await res.json();
      if (res.ok) {
        setAttachments(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  async function handleUpload(category: string, file: File) {
    setUploadingFor(category);
    try {
      // Step 1: Upload the file
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");

      // Step 2: Delete any existing attachment in this category (replace)
      const existing = attachments.filter((a) => a.category === category);
      for (const a of existing) {
        await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
      }

      // Step 3: Link the new upload as an attachment
      const docType = DOCUMENT_TYPES.find((d) => d.category === category);
      const attachRes = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "Employee",
          entityId: employeeId,
          uploadId: uploadData.id,
          category,
          label: docType?.label ?? category,
        }),
      });
      const attachData = await attachRes.json();
      if (!attachRes.ok) throw new Error(attachData.error ?? "Link failed");

      haptic([10, 40, 80]);
      toast.success(`${docType?.label ?? "Document"} uploaded`);
      fetchAttachments();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleDelete(id: string, _category: string) {
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      haptic(10);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Document removed");
    } catch {
      toast.error("Could not remove document");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-400)" }} />
        <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Loading documents…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {DOCUMENT_TYPES.map((docType) => {
        const docs = attachments.filter((a) => a.category === docType.category);
        const hasDoc = docs.length > 0;
        const isUploading = uploadingFor === docType.category;
        const firstDoc = docs[0];

        return (
          <div
            key={docType.category}
            className="rounded-[0.5rem] overflow-hidden"
            style={{
              backgroundColor: "var(--color-paper)",
              border: `1px solid ${hasDoc ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))" : "var(--color-line)"}`,
            }}
          >
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Status icon */}
                <div
                  className="shrink-0 grid place-items-center size-7 rounded-full"
                  style={{
                    backgroundColor: hasDoc
                      ? "color-mix(in srgb, var(--color-go) 15%, transparent)"
                      : "var(--color-ink-100)",
                  }}
                >
                  {isUploading ? (
                    <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
                  ) : hasDoc ? (
                    <Check className="size-3.5" style={{ color: "var(--color-go)" }} />
                  ) : (
                    <FileText className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-m-label font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {docType.label}
                    </p>
                    {docType.required && (
                      <span
                        className="text-micro font-bold px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--color-ink-100)",
                          color: "var(--color-ink-500)",
                        }}
                      >
                        REQUIRED
                      </span>
                    )}
                  </div>
                  {hasDoc && firstDoc && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {firstDoc.upload.mimeType.startsWith("image/") ? (
                        <ImageIcon className="size-3" style={{ color: "var(--color-ink-400)" }} />
                      ) : (
                        <FileText className="size-3" style={{ color: "var(--color-ink-400)" }} />
                      )}
                      <a
                        href={firstDoc.upload.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-m-caption hover:underline truncate"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        {firstDoc.upload.originalName}
                      </a>
                      <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-300)" }}>
                        {formatSize(firstDoc.upload.size)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  {hasDoc && firstDoc && (
                    <button
                      onClick={() => handleDelete(firstDoc.id, docType.category)}
                      className="grid place-items-center size-7 rounded-full press"
                      style={{ backgroundColor: "var(--color-ink-100)" }}
                      title="Remove"
                    >
                      <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                    </button>
                  )}
                  <label
                    className={`grid place-items-center size-7 rounded-full press ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
                    style={{
                      backgroundColor: hasDoc ? "var(--color-ink-100)" : "var(--color-ink-950)",
                    }}
                    title={hasDoc ? "Replace" : "Upload"}
                  >
                    {hasDoc ? (
                      <Upload className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
                    ) : (
                      <Plus className="size-3.5" style={{ color: "var(--color-paper)" }} />
                    )}
                    <input
                      ref={(el) => { fileRefs.current[docType.category] = el; }}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(docType.category, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div className="pt-1 px-1">
        <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
          {attachments.filter((a) => DOCUMENT_TYPES.some((d) => d.category === a.category)).length}
          {" / "}
          {DOCUMENT_TYPES.length} documents uploaded
          {" · "}
          {DOCUMENT_TYPES.filter((d) => d.required).filter((d) => attachments.some((a) => a.category === d.category)).length}
          {" / "}
          {DOCUMENT_TYPES.filter((d) => d.required).length} required
        </p>
      </div>
    </div>
  );
}
