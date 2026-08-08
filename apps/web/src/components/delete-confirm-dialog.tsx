"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirm-and-delete dialog. Calls the given endpoint with DELETE and
 * refreshes the route on success.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  endpoint,
  title,
  description,
  successMessage = "Deleted",
  errorMessage = "Failed to delete",
  redirectTo,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
  title: string;
  description: string;
  successMessage?: string;
  errorMessage?: string;
  redirectTo?: string;
  /** Called after a successful delete, before router.refresh(). Use for optimistic UI updates. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onConfirm() {
    setDeleting(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? errorMessage);
      toast.success(successMessage);
      onOpenChange(false);
      onSuccess?.();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Dialog>
  );
}
