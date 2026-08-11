import { cn } from "@/lib/utils";

/**
 * EMPTY STATE — the most-neglected screen in every ERP, and the first
 * one a new user sees.
 *
 * An empty state must answer three questions, in this order:
 *   1. Is this broken?      → no: a calm icon, not an error
 *   2. Why is it empty?     → `description`, in plain language
 *   3. What do I do now?    → `action`, the single next step
 *
 * If we can't answer (3), the page probably shouldn't exist.
 *
 * The icon sits in a dashed-outline plate rather than a filled grey
 * square: dashed reads as "a slot waiting to be filled", which is
 * exactly the message, where a solid grey box reads as a broken image.
 */
export function EmptyState({
  icon,
  title,
  description,
  hint,
  action,
  secondaryAction,
  contactHint,
  size = "default",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Secondary guidance line — appears below the description in smaller text. */
  hint?: string;
  action?: React.ReactNode;
  /** A quieter alternative next to the primary action ("Import from CSV"). */
  secondaryAction?: React.ReactNode;
  /** Shown when the user's role can't create the thing — replaces the action. */
  contactHint?: string;
  /** `compact` for empty states inside a card or a table body. */
  size?: "default" | "compact";
  className?: string;
}) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "gap-3 py-12" : "gap-4 py-24",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-border-strong",
          "bg-subtle text-faint",
          compact ? "size-11 [&_svg]:size-5" : "size-16 [&_svg]:size-7",
        )}
      >
        {icon}
      </div>

      <div className="space-y-1.5">
        <p className={cn("font-semibold text-foreground", compact ? "text-body" : "text-section")}>
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-sm text-meta leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {hint && (
          <p className="mx-auto max-w-sm text-caption leading-relaxed text-faint">{hint}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {secondaryAction}
          {action}
        </div>
      )}
      {!action && contactHint && (
        <p className="mt-1 text-caption text-faint">{contactHint}</p>
      )}
    </div>
  );
}
