"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight modal dialog. Renders into a fixed overlay with backdrop.
 * Controlled via `open` / `onOpenChange`.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Optional action node rendered in the header (e.g. a print button). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 my-6 w-full max-w-lg rounded-lg border border-border bg-card shadow-overlay",
          className,
        )}
      >
        {/* The header is a distinct band, separated by a hairline. A modal
            is a small page: it gets the same title / description / rule
            hierarchy as one, so the ask is clear before the fields are. */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-meta leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            <button
              className="-mr-1.5 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
