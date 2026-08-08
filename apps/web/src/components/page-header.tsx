import { cn } from "@/lib/utils";

/**
 * PAGE HEADER — the top of every page, and the contract for the page.
 *
 * Three jobs, in priority order:
 *
 *  1. Say where you are (title) and, if it isn't obvious, what this
 *     page is for (`description` — one plain-language line, the same
 *     `hint` we wrote in nav.ts. Write it once, show it everywhere.)
 *  2. Show the numbers that make the page make sense (`stats`) so you
 *     don't have to scan the table to get the gist.
 *  3. Offer exactly ONE primary action (`action`). Anything else goes
 *     in `secondaryActions`, which renders quieter, to the left of it.
 *
 * The one-primary-action rule is the whole point. A page with four
 * equal-weight buttons has no design; it has a toolbar and a shrug.
 */
export function PageHeader({
  title,
  description,
  action,
  secondaryActions,
  stats,
  className,
}: {
  title: string;
  description?: string;
  /** The single primary action. Renders as the rightmost, loudest control. */
  action?: React.ReactNode;
  /** Everything else. Renders quieter, before the primary action. */
  secondaryActions?: React.ReactNode;
  stats?: { label: string; value: string | number; tone?: "default" | "warning" | "danger" | "success" }[];
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border pb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-title text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-meta leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {(action || secondaryActions) && (
          <div className="flex shrink-0 items-center gap-2">
            {secondaryActions}
            {action}
          </div>
        )}
      </div>

      {/* Stats sit BELOW the title row, on their own line, so they never
          compete with the action for the same horizontal space. */}
      {stats && stats.length > 0 && (
        <dl className="mt-3.5 flex flex-wrap items-baseline gap-x-7 gap-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <dt className="text-label text-muted-foreground/70">{s.label}</dt>
              <dd
                className={cn(
                  "text-body font-semibold tnum",
                  s.tone === "warning" && "text-warning",
                  s.tone === "danger" && "text-danger",
                  s.tone === "success" && "text-success",
                  (!s.tone || s.tone === "default") && "text-foreground",
                )}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
