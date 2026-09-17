"use client";

import { useCallback, useRef, useState } from "react";
import { PromptDialog } from "@/components/prompt-dialog";

/**
 * ═══════════════════════════════════════════════════════════════════
 * usePrompt — an imperative text-input dialog hook.
 *
 * Replaces native `window.prompt()` with a styled, accessible dialog
 * (single-line input or textarea), matching useConfirm's pattern.
 *
 * Usage:
 *
 *   const [prompt, promptDialog] = usePrompt();
 *   ...
 *   const reason = await prompt({
 *     title: "Reject DPR",
 *     label: "Reason",
 *     placeholder: "Why is this being rejected?",
 *     multiline: true,
 *     confirmLabel: "Reject",
 *   });
 *   if (reason === null) return; // cancelled / dismissed
 *   // proceed with `reason`
 *
 * `prompt(opts)` resolves to the entered string (trimmed) on confirm,
 * or `null` on cancel/dismiss. The dialog renders itself — just include
 * `{promptDialog}` in your JSX once.
 * ═══════════════════════════════════════════════════════════════════
 */

interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Block empty submission (inline error). Default true. */
  required?: boolean;
  /** Textarea instead of input — for reasons/notes. */
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function usePrompt() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PromptOptions>({ title: "" });
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    setOpts(options);
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleSubmit = useCallback((value: string) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    // Closed without submitting (backdrop, Escape, Cancel) → null.
    if (!next && resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
  }, []);

  const dialog = (
    <PromptDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={opts.title}
      description={opts.description}
      label={opts.label}
      defaultValue={opts.defaultValue}
      placeholder={opts.placeholder}
      required={opts.required}
      multiline={opts.multiline}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      onSubmit={handleSubmit}
    />
  );

  return [prompt, dialog] as const;
}
