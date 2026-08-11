"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Photo = {
  url: string;
  fileName?: string;
};

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
  className,
}: {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  label?: string;
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
      onChange(photos.filter((_, i) => i !== index));
    },
    [photos, onChange],
  );

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.fileName ?? `Photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
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
        accept="image/*"
        capture="environment"
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
