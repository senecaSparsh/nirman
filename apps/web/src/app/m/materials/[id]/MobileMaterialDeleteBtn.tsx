"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, X, Pencil } from "lucide-react";
import { toast } from "sonner";

export function MobileMaterialDeleteBtn({ materialId, materialName }: { materialId: string; materialName: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/materials/${materialId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Material archived");
      setShow(false);
      router.push("/m/materials");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <a
          href={`/m/materials/${materialId}/edit`}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
        >
          <Pencil className="size-3.5" />
          Edit Material
        </a>
        <button
          onClick={() => setShow(true)}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
          style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
        >
          <Trash2 className="size-3.5" />
          Archive
        </button>
      </div>

      {show ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShow(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Archive Material?</p>
              <button onClick={() => setShow(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will archive <span className="font-bold">{materialName}</span>. The material will be hidden from lists but existing stock movements and references are preserved. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShow(false)} disabled={deleting} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "Archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
