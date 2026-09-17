"use client";

import * as React from "react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Generic input prompt — replaces native `window.prompt()` with a styled,
 * mobile-friendly dialog. The parent receives the entered value via
 * `onSubmit`; cancelling just closes (see usePrompt for the promise API).
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  defaultValue = "",
  placeholder,
  required = true,
  multiline = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Block empty submission and show an inline error. Default true. */
  required?: boolean;
  /** Multi-line textarea instead of a single-line input (e.g. reasons). */
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = React.useId();

  // Reset whenever the dialog (re)opens with a new default value.
  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError("");
    }
  }, [open, defaultValue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError("This field is required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-2">
        {label ? <Label htmlFor={`${formId}-input`} required={required}>{label}</Label> : null}
        {multiline ? (
          <Textarea
            id={`${formId}-input`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={3}
            autoFocus
          />
        ) : (
          <Input
            id={`${formId}-input`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        )}
        {error ? (
          <p className="text-caption" style={{ color: "var(--color-stop)" }}>
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
