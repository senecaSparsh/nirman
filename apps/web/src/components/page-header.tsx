import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PAGE HEADER — the top of every page, and the contract for the page.
 *
 * Four jobs, in priority order:
 *
 *  1. Say where you are (`breadcrumbs` + `title`) and, if it isn't
 *     obvious, what this page is for (`description` — one plain-language
 *     line, the same `hint` we wrote in nav.ts. Write it once, show it
 *     everywhere.)
 *  2. Offer exactly ONE primary action (`action`). Anything else goes in
 *     `secondaryActions`, which renders quieter, to its left.
 *  3. Show the numbers that make the page make sense (`stats`) so you
 *     don't have to scan the table to get the gist.
 *  4. Get out of the way. It is chrome, not content.
 *
 * The one-primary-action rule is the whole point. A page with four
 * equal-weight buttons has no design; it has a toolbar and a shrug.
 *
 * Layout change from v1: the stats row is now a divided band with the
 * label *above* the figure. Reading a value takes one eye movement
 * instead of two, and a band of hairline-separated cells reads as one
 * instrument panel rather than as loose text competing with the title.
 */
export function PageHeader({
  title,
  description,
  action,
  secondaryActions,
  stats,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  /** The single primary action. Renders as the rightmost, loudest control. */
  action?: React.ReactNode;
  /** Everything else. Renders quieter, before the primary action. */
  secondaryActions?: React.ReactNode;
  stats?: {
    label: string;
    value: string | number;
    tone?: "default" | "warning" | "danger" | "success" | "muted";
    /** Hover tooltip explaining what this number means and how it's calculated. */
    hint?: string;
  }[];
  /** Breadcrumb trail above the title. Last item is the current page (no link). */
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <header className={cn("min-w-0", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex flex-wrap items-center gap-x-1 text-caption text-muted-foreground"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-faint" />}
              {crumb.href && i < breadcrumbs.length - 1 ? (
                <Link
                  href={crumb.href}
                  className="rounded transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-title text-foreground">{title}</h1>
          {description && (
            <div className="mt-1.5 max-w-prose text-meta leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 no-print">
          {/* Stats sit INLINE with the heading, right-aligned, so the
              numbers are visible without scrolling and don't compete with
              the title for vertical space. */}
          {stats && stats.length > 0 && (
            <dl className="flex flex-wrap items-start gap-x-6 gap-y-2">
              {stats.map((s, i) => (
                <div key={i} className="group/stat relative min-w-0">
                  <dt className="text-label leading-none text-muted-foreground">{s.label}</dt>
                  <dd
                    className={cn(
                      "mt-1 text-[13px] font-semibold leading-none tnum",
                      s.tone === "warning" && "text-warning",
                      s.tone === "danger" && "text-danger",
                      s.tone === "success" && "text-success",
                      s.tone === "muted" && "text-muted-foreground",
                      (!s.tone || s.tone === "default") && "text-foreground",
                    )}
                  >
                    {s.value}
                  </dd>
                  {s.hint && (
                    <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-max max-w-xs rounded-md border border-border bg-elevated px-3 py-2 text-caption leading-relaxed text-muted-foreground shadow-overlay group-hover/stat:block">
                      {s.hint}
                    </div>
                  )}
                </div>
              ))}
            </dl>
          )}

          {(action || secondaryActions) && (
            <div className="flex items-center gap-2">
              {secondaryActions}
              {action}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * SUB-NAV — the horizontal strip of sibling pages that belong to one
 * hub (Stock → On Hand / Movements / Transfers / Issues / Scrap).
 *
 * This exists so hub pages can stop being seven client-side tabs that
 * each fetch independently. Each entry is a real route, so it's
 * linkable, back-button-able, and server-rendered on its own.
 */
export function SubNav({
  items,
  className,
}: {
  items: { label: string; href: string; active?: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "-mx-1 overflow-x-auto border-b border-border scrollbar-none no-print",
        className,
      )}
    >
      <div className="flex min-w-full items-stretch gap-1 px-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 pb-2.5 pt-2",
              "text-[13px] transition-colors duration-100",
              item.active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                  "text-[10px] font-semibold tabular-nums leading-none",
                  item.active ? "bg-brand-soft text-brand-strong" : "bg-muted text-muted-foreground",
                )}
              >
                {item.count > 99 ? "99+" : item.count}
              </span>
            )}
            {item.active && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
