"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * ═══════════════════════════════════════════════════════════════════
 * useConfirm — an imperative confirmation dialog hook.
 *
 * Replaces native `window.confirm()` with a styled, accessible dialog
 * that supports multi-line messages, async actions, and a busy state.
 *
 * Usage:
 *
 *   const confirm = useConfirm();
 *   ...
 *   const ok = await confirm({
 *     title: "Delete item?",
 *     description: "This will also delete all child items.",
 *     confirmLabel: "Delete",
 *     variant: "destructive",
 *   });
 *   if (!ok) return;
 *   // proceed with deletion
 *
 * The hook returns a `confirm(opts)` function that resolves to `true`
 * when the user clicks the confirm button and `false` when they cancel
 * (or dismiss the dialog). The dialog itself is rendered by the hook —
 * no extra JSX is needed at the call site.
 *
 * The `description` field accepts `ReactNode`, so multi-line messages
 * (e.g. WBS delete warnings with child/MB counts) render correctly via
 * the `whitespace-pre-line` CSS on the Dialog description.
 * ═══════════════════════════════════════════════════════════════════
 */

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default" | "outline";
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({
    title: "",
    description: "",
  });
  // The resolver ref holds the Promise's resolve function so the
  // onConfirm / onCancel handlers can settle it.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    // If the dialog was closed without confirming (backdrop click, Escape,
    // Cancel button), resolve with false.
    if (!next && resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  // Render the dialog. This is returned as a ReactNode — the caller
  // must render it (typically at the end of their component's JSX).
  // Alternatively, we could use a portal, but rendering inline is
  // simpler and works fine since the dialog uses `position: fixed`.
  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={opts.title}
      description={opts.description ?? ""}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      variant={opts.variant}
      onConfirm={handleConfirm}
    />
  );

  return [confirm, dialog] as const;
}
