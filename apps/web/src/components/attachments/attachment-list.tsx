"use client";

import { useState, useEffect, useCallback } from "react";
import { Paperclip, X, FileText, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
 * ExtraDocument — a per-entity URL field (ATS, BBA, registry, cheque photo,
 * rent agreement, etc.) that is stored directly on the entity model rather
 * than via EntityAttachment. Passed in by the parent so the user sees ALL
 * documents in one unified view.
 */
export interface ExtraDocument {
  url: string | null | undefined;
  label: string;
  category?: string;
}

/**
 * AttachmentList — reusable component for showing + adding polymorphic
 * document attachments on any entity. Renders a compact list of attached
 * files with an "Attach" button that opens a file picker.
 *
 * The optional `extraDocuments` prop lets callers pass in per-entity URL
 * fields (ATS, BBA, registry, cheque photos, etc.) so they appear in the
 * same unified document view alongside the EntityAttachment records.
 *
 * Usage:
 *   <AttachmentList entityType="PurchaseOrder" entityId={po.id} />
 *   <AttachmentList
 *     entityType="AssetSale"
 *     entityId={sale.id}
 *     extraDocuments={[
 *       { url: sale.atsDocumentUrl, label: "ATS Document", category: "ATS" },
 *       { url: sale.registryDocumentUrl, label: "Registry Document", category: "Registry" },
 *     ]}
 *   />
 */
export function AttachmentList({
  entityType,
  entityId,
  maxAttachments = 10,
  compact = false,
  extraDocuments = [],
}: {
  entityType: string;
  entityId: string;
  maxAttachments?: number;
  compact?: boolean;
  extraDocuments?: ExtraDocument[];
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments?entityType=${entityType}&entityId=${entityId}`);
      const data = await res.json();
      if (res.ok) {
        setAttachments(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachments.length >= maxAttachments) {
      toast.error(`Maximum ${maxAttachments} attachments reached`);
      return;
    }

    setUploading(true);
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

      // Step 2: Link it as an attachment
      const attachRes = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          uploadId: uploadData.id,
          category: file.type.startsWith("image/") ? "photo" : "document",
          label: file.name,
        }),
      });
      const attachData = await attachRes.json();
      if (!attachRes.ok) throw new Error(attachData.error ?? "Link failed");

      toast.success("Attachment added");
      fetchAttachments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to attach file");
    } finally {
      setUploading(false);
      // Reset the input so the same file can be selected again
      e.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Attachment removed");
    } catch {
      toast.error("Could not remove attachment");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Filter out extra documents with null/empty URLs
  const validExtraDocs = extraDocuments.filter((d) => d.url);
  const totalCount = attachments.length + validExtraDocs.length;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading attachments…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
          <Paperclip className="size-3" />
          Documents ({totalCount})
        </div>
        <label
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption font-medium cursor-pointer hover:bg-muted/20",
            (uploading || attachments.length >= maxAttachments) && "opacity-50 pointer-events-none",
          )}
        >
          {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          Attach
          <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" />
        </label>
      </div>

      {totalCount === 0 ? (
        <p className="text-caption text-muted-foreground">
          No documents. Click &quot;Attach&quot; to upload a document or photo.
        </p>
      ) : (
        <div className={cn("space-y-1", compact && "flex flex-wrap gap-1.5")}>
          {/* Per-entity URL fields (ATS, BBA, registry, cheque photos, etc.) */}
          {validExtraDocs.map((doc, i) => {
            const url = doc.url as string;
            const isImage = url.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i);
            return (
              <div
                key={`extra-${i}`}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border bg-brand/5 px-2 py-1.5",
                  compact && "inline-flex",
                )}
              >
                {isImage ? (
                  <ImageIcon className="size-3.5 shrink-0 text-brand" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-brand" />
                )}
                {doc.category && (
                  <span className="text-micro font-bold uppercase text-brand shrink-0">{doc.category}</span>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption font-medium hover:underline truncate max-w-[200px]"
                >
                  {doc.label}
                </a>
              </div>
            );
          })}

          {/* EntityAttachment records (generic attachments) */}
          {attachments.map((a) => {
            const isImage = a.upload.mimeType.startsWith("image/");
            return (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5",
                  compact && "inline-flex",
                )}
              >
                {isImage ? (
                  <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <a
                  href={a.upload.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption font-medium hover:underline truncate max-w-[200px]"
                >
                  {a.label ?? a.upload.originalName}
                </a>
                <span className="text-caption text-muted-foreground shrink-0">{formatSize(a.upload.size)}</span>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="shrink-0 text-muted-foreground hover:text-danger"
                  title="Remove attachment"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
