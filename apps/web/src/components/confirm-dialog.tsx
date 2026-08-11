"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Generic confirmation dialog for destructive or irreversible actions.
 * Unlike DeleteConfirmDialog (which always does a DELETE fetch), this
 * component just asks the user to confirm — the parent decides what happens next.
 *
 * Use this instead of native `confirm()` for a consistent, styled UX.
 * The description accepts ReactNode so multi-line messages, bold text,
 * or structured content can be rendered properly.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default" | "outline";
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={variant} onClick={handleConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
