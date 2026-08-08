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
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground/55 [&_svg]:size-[18px]">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-body font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-meta leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
