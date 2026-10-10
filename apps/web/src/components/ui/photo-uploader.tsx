"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {Camera, X, Loader2, FileText, CloudOff} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { putPendingPhoto, getPendingPhoto, deletePendingPhoto } from "@/lib/offline/photo-store";

export type Photo = {
  url: string;
  fileName?: string;
  /** Set when the upload failed offline — the File blob lives in the
   * pending-photo store under this id and `url` is a local blob: preview.
   * Re-uploaded on reconnect; forms submit pendingId refs so sync can resolve
   * the real URL. */
  pendingId?: string;
};

function isImageFile(photo: Photo): boolean {
  const name = photo.fileName ?? photo.url;
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name) || photo.url.startsWith("data:image") || photo.url.startsWith("blob:");
}

/**
 * PhotoUploader — reusable photo upload component.
 *
 * Features:
 * - Drag & drop or click to select
 * - Camera capture on mobile (input capture="environment")
 * - Multiple photos
 * - Preview thumbnails with remove button
 * - Uploads to /api/uploads and returns URLs
 * - Loading state per photo
 *
 * Usage:
 *   <PhotoUploader photos={photos} onChange={setPhotos} maxPhotos={10} />
 */
export function PhotoUploader({
  photos,
  onChange,
  maxPhotos = 10,
  label = "Add Photo",
  accept = "image/*",
  className,
}: {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  label?: string;
  accept?: string;
  className?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File): Promise<Photo | null> => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      return { url: data.url, fileName: data.fileName };
    } catch (err) {
      // Offline: keep the File — a photo taken at the point of capture (a
      // challan, a cracked beam) is evidence that can't be retaken later.
      // Retain the blob + show a local preview marked pending; it uploads on
      // reconnect and the offline queue resolves the real URL before replay.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const id = crypto.randomUUID();
        try {
          await putPendingPhoto(id, file, file.name);
          toast.success("Saved offline — photo will upload when you're back online");
          return { url: URL.createObjectURL(file), fileName: file.name, pendingId: id };
        } catch {
          // IDB write failed — fall through to the generic error.
        }
      }
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) {
        toast.error(`Maximum ${maxPhotos} photos allowed`);
        return;
      }
      const toUpload = Array.from(files).slice(0, remaining);
      setUploading(true);
      try {
        const results = await Promise.all(toUpload.map(uploadFile));
        const valid = results.filter((r): r is Photo => r !== null);
        if (valid.length > 0) {
          onChange([...photos, ...valid]);
        }
      } finally {
        setUploading(false);
      }
    },
    [photos, onChange, maxPhotos, uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const removePhoto = useCallback(
    (index: number) => {
      const removed = photos[index];
      if (removed?.pendingId) void deletePendingPhoto(removed.pendingId).catch(() => {});
      onChange(photos.filter((_, i) => i !== index));
    },
    [photos, onChange],
  );

  // Reconnect: upload any photo retained offline — swap its local blob:
  // preview for the real URL once connectivity returns so the submitted form
  // carries a working link. Runs on mount (queued items may already be
  // pending) and whenever the network comes back.
  useEffect(() => {
    let cancelled = false;
    async function resolvePending() {
      const pending = photos.filter((p) => p.pendingId);
      if (pending.length === 0 || !navigator.onLine) return;
      let next = photos;
      for (const photo of pending) {
        try {
          // Peek (not take) — only drop the stored blob after the upload
          // succeeds, so a failed retry doesn't lose the photo.
          const stored = await getPendingPhoto(photo.pendingId!);
          if (!stored) continue;
          const formData = new FormData();
          formData.append("file", stored.blob, stored.fileName ?? "photo.jpg");
          const res = await fetch("/api/uploads", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Upload failed");
          if (cancelled) return;
          await deletePendingPhoto(photo.pendingId!).catch(() => {});
          next = next.map((p) =>
            p.pendingId === photo.pendingId ? { url: data.url, fileName: data.fileName } : p,
          );
          toast.success(`Offline photo "${stored.fileName ?? "photo"}" uploaded`);
        } catch {
          // Still offline or the upload failed — leave it pending; the next
          // reconnect retries. The blob stays in the store.
        }
      }
      if (!cancelled && next !== photos) onChange(next);
    }
    resolvePending();
    window.addEventListener("online", resolvePending);
    return () => {
      cancelled = true;
      window.removeEventListener("online", resolvePending);
    };
     
  }, [photos, onChange]);

  const canAddMore = photos.length < maxPhotos;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Photo previews */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, i) => (
            <div
              key={i}
              className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted"
            >
              {isImageFile(photo) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photo.url}
                  alt={photo.fileName ?? `Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground hover:text-foreground"
                  title={photo.fileName ?? "Open document"}
                >
                  <FileText className="h-6 w-6" />
                  <span className="w-full truncate px-0.5 text-center text-[9px] leading-tight">
                    {photo.fileName?.split("/").pop() ?? "Document"}
                  </span>
                </a>
              )}
              {photo.pendingId && (
                <span
                  className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-warning/90 py-0.5 text-[8px] font-bold text-white"
                  title="Saved offline — uploads when you're back online"
                >
                  <CloudOff className="h-2.5 w-2.5" /> offline
                </span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg rounded-tr-lg bg-danger/90 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canAddMore && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-caption text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-subtle",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              {label}
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        // capture only makes sense for image-only pickers — it forces the
        // camera on mobile, blocking file/document selection entirely.
        capture={accept === "image/*" ? "environment" : undefined}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ""; // reset so same file can be re-selected
        }}
      />
    </div>
  );
}
