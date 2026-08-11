"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-6xl",
} as const;

/**
 * DIALOG — a modal is a small page, so it gets a page's hierarchy:
 * title, one-line description, a hairline, then the work.
 *
 * Two things that matter more than they look like they should:
 *
 *  · On a phone this docks to the bottom of the viewport and slides up
 *    as a sheet, because a centred modal with a keyboard open leaves
 *    the submit button under the thumb-shelf where nobody can find it.
 *    From `sm` up it's a centred card.
 *  · The body scrolls, the header and footer don't. A 30-line PO form
 *    must not push its Submit button off the bottom of the screen.
 *
 * `footer` is the place for the two-button contract: secondary on the
 * left, primary on the right. Pass it rather than putting buttons in
 * `children`, so they stay pinned while the body scrolls.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  footer,
  size = "md",
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Optional action node rendered in the header (e.g. a print button). */
  action?: React.ReactNode;
  /** Pinned footer — put Cancel + the primary action here. */
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:overflow-y-auto sm:p-6">
      <div
        className="drawer-backdrop fixed inset-0 bg-foreground/40 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "sheet-up relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden",
          "rounded-t-xl border border-border bg-elevated shadow-overlay",
          "sm:overlay-in sm:my-8 sm:max-h-[86vh] sm:rounded-xl",
          SIZES[size],
          className,
        )}
      >
        {/* Grab handle — a phone affordance only; on desktop the header
            rule already says "this panel ends here". */}
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" />

        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-section text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 whitespace-pre-line text-meta leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-1">
            {action}
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-subtle/60 px-5 py-3 pb-safe">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
