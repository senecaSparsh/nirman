"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useConfirm } from "@/lib/use-confirm";

/**
 * MobileDeleteProjectButton — renders a "Delete" button in the project
 * detail hero card. Calls DELETE /api/projects/[id] (soft-delete) and
 * redirects to /m/projects on success.
 */
export function MobileDeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete project "${name}"?`,
      description: "This will archive the project. Related WBS, BOQ, and POs will remain.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      haptic(10);
      toast.success("Project archived");
      router.push("/m/real-estate?tab=projects");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={busy}
        className="grid place-items-center h-7 w-7 rounded-[0.5rem] border-2 press"
        style={{
          borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
          color: "var(--color-stop)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
      {confirmDialog}
    </>
  );
}
