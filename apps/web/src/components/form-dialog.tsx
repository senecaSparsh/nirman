"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * FORM DIALOG — the shared create/edit dialog.
 *
 * Replaces the 24+ form-dialog components that each re-implement:
 * Dialog wrapper + form state + submit handler + loading state +
 * toast + error display + close-on-success.
 *
 * The component manages: open/close, submit loading, error toast,
 * success toast, and router.refresh() after success. The caller
 * provides the form body (children) and the onSubmit handler.
 *
 * Usage:
 *   <FormDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="New Purchase Order"
 *     description="Create a PO for this supplier"
 *     size="lg"
 *     submitLabel="Create PO"
 *     onSubmit={async (formData) => {
 *       const res = await fetch("/api/purchase-orders", { method: "POST", body: JSON.stringify(formData) });
 *       if (!res.ok) throw new Error(await res.text());
 *       return res.json();
 *     }}
 *   >
 *     <Field label="Supplier" required>...</Field>
 *     <Field label="Date" required>...</Field>
 *   </FormDialog>
 *
 * For simpler cases where you just want to POST/PATCH JSON:
 *   <FormDialog
 *     ...
 *     onSubmit={async () => {
 *       const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(values) });
 *       if (!res.ok) throw new Error("Failed");
 *     }}
 *   />
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  onSubmit,
  onSuccess,
  successMessage = "Saved",
  errorMessage = "Failed to save",
  refreshOnSuccess = true,
  children,
  className,
  footerExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  submitLabel?: string;
  cancelLabel?: string;
  /** Submit handler. Throw to signal failure (error toast shown). */
  onSubmit: () => Promise<void>;
  /** Called after a successful submit (before refresh). */
  onSuccess?: () => void;
  successMessage?: string;
  errorMessage?: string;
  /** Call router.refresh() after success. Default true. */
  refreshOnSuccess?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Extra elements rendered in the footer (left of Cancel). */
  footerExtra?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const formId = React.useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit();
      toast.success(successMessage);
      onSuccess?.();
      onOpenChange(false);
      if (refreshOnSuccess) router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : errorMessage;
      toast.error(msg || errorMessage);
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
      size={size}
      className={className}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">{footerExtra}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} loading={busy}>
              {submitLabel}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {children}
      </form>
    </Dialog>
  );
}

/**
 * FORM FIELDSET — a labelled group of fields inside a FormDialog.
 * Wraps the existing Fieldset from ui/input with consistent spacing.
 */
export function FormFieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-0.5 text-label text-muted-foreground">{legend}</legend>
      {description && <p className="mb-3 text-caption text-muted-foreground">{description}</p>}
      <div className={cn(!description && "mt-3", "grid gap-x-5 gap-y-4 sm:grid-cols-2")}>
        {children}
      </div>
    </fieldset>
  );
}
