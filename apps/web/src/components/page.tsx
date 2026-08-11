import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * LAYOUT VOCABULARY
 *
 * Every page in Nirman is built from these six pieces. That's the
 * whole point: if a page needs a seventh, either the piece belongs
 * here or the page is doing too much.
 *
 *   <Page>        the vertical rhythm of a page (one spacing scale)
 *   <Section>     a titled block of content, with an optional action
 *   <Toolbar>     filters + search, always directly above the data
 *   <MetricGrid>  / <Metric>   the numbers, with their provenance
 *   <Figure>      a single number that can explain where it came from
 *   <StatusPill>  every status in the app, styled from one place
 *
 * Design decisions encoded here:
 *
 *  · Cards are containers for *data*, never for decoration. A page is
 *    not "a grid of cards"; it's content with a couple of containers.
 *  · Every computed number can explain itself (`provenance`). This is
 *    the "do the complex work for them" promise: the user shouldn't
 *    need to open a report to learn what a number means.
 *  · Status colour is defined in ONE map. Ten modules with ten status
 *    vocabularies is why the app felt incoherent.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Page ──────────────────────────────────────────────────────────

/**
 * The page's vertical rhythm. Use this instead of ad-hoc space-y-*.
 *
 * Page padding and the reading measure are owned by the shell's `<main>`
 * (see app-shell.tsx), not here — otherwise a page that forgets to use
 * `<Page>` would have no padding at all, and one that uses it twice
 * (a hub rendering a sub-view) would double it.
 *
 * `wide` opts out of the shell's measure cap for the genuinely wide
 * views — ledgers, Gantt charts, matrix reports.
 */
export function Page({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Removes the reading-measure cap for wide data views. */
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-6", wide && "max-w-none", className)}>{children}</div>
  );
}

// ── Section ───────────────────────────────────────────────────────

/**
 * A titled block. `bare` drops the card chrome for content that is
 * already visually contained (a table with its own borders, a chart).
 *
 * The heading row sits *outside* the container. A title inside the card
 * competes with the card's own header band; outside, it reads as a label
 * for the object below it, which is what it is.
 */
export function Section({
  title,
  description,
  action,
  children,
  bare = false,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bare?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="text-section text-foreground">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0 no-print">{action}</div>}
        </div>
      )}
      {bare ? (
        children
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          {children}
        </div>
      )}
    </section>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────

/**
 * Filters and search. Always sits directly on top of the data it
 * filters, sharing its top corners, so the relationship is physical
 * rather than something you infer.
 */
export function Toolbar({
  children,
  attached = true,
  className,
}: {
  children: React.ReactNode;
  /** true = joined to the container below it (no bottom rounding) */
  attached?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border border-border bg-subtle px-3 py-2.5",
        attached ? "rounded-t-lg border-b-0" : "rounded-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A count that sits at the end of a toolbar. "142 items". */
export function ToolbarCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto shrink-0 text-caption tnum text-muted-foreground">{children}</span>
  );
}

/** A vertical hairline between groups of toolbar controls. */
export function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

// ── Metrics ───────────────────────────────────────────────────────

const METRIC_TONES = {
  default: "text-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const;

export type MetricTone = keyof typeof METRIC_TONES;

/**
 * A row of numbers. Deliberately NOT a card grid — metrics are one
 * horizontal band divided by hairlines, which reads as a single
 * instrument panel instead of six competing boxes.
 *
 * On a phone this becomes a 2-up grid rather than a single column: six
 * stacked full-width rows is six screens of scrolling before you reach
 * the actual page.
 */
export function MetricGrid({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  const colClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 lg:grid-cols-5",
  }[cols];

  return (
    <div
      className={cn(
        // A 1px gap over a border-coloured background draws the internal
        // hairlines exactly, with no stray rule on the outer edges — which
        // is what `divide-x`/`divide-y` gets wrong on a wrapping grid.
        "grid gap-px overflow-hidden rounded-lg border border-border bg-border shadow-raised",
        "[&>*]:bg-card",
        colClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One number in the panel.
 *
 * `provenance` is the important prop: it's the one-line explanation of
 * how the number was derived ("Σ qty × moving average cost, all
 * locations"). It renders as a quiet info affordance, so a number is
 * never a mystery the user has to go and investigate.
 */
export function Metric({
  label,
  value,
  sub,
  tone = "default",
  provenance,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: MetricTone;
  provenance?: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const body = (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-faint [&_svg]:size-3.5">{icon}</span>}
        <span className="min-w-0 truncate text-label text-muted-foreground">{label}</span>
        {provenance && (
          <span
            title={provenance}
            className="shrink-0 text-faint transition-colors hover:text-muted-foreground"
          >
            <Info className="size-3" />
          </span>
        )}
        {href && (
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        )}
      </div>
      <span className={cn("text-figure", METRIC_TONES[tone])}>{value}</span>
      {sub && <span className="mt-auto text-caption leading-snug text-muted-foreground">{sub}</span>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block bg-card transition-colors hover:bg-subtle">
        {body}
      </Link>
    );
  }
  return body;
}

/**
 * A standalone number with its label — for use inside tables, drawers
 * and detail panels where a full Metric panel would be too heavy.
 */
export function Figure({
  label,
  value,
  tone = "default",
  provenance,
  className,
}: {
  label: string;
  value: string | number;
  tone?: MetricTone;
  provenance?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1">
        <span className="text-label text-muted-foreground">{label}</span>
        {provenance && (
          <span title={provenance} className="text-faint">
            <Info className="size-3" />
          </span>
        )}
      </div>
      <div className={cn("mt-1 text-[15px] font-semibold leading-none tnum", METRIC_TONES[tone])}>
        {value}
      </div>
    </div>
  );
}

// ── Status ────────────────────────────────────────────────────────

/**
 * ONE definition of what every status looks like, across every module.
 *
 * Grouped by meaning, not by module:
 *   neutral  — not started, nothing to do yet
 *   active   — in flight, someone is working on it
 *   waiting  — blocked on a human decision
 *   good     — finished successfully
 *   bad      — cancelled, rejected, failed
 *   alert    — needs attention now
 */
const STATUS_MEANING: Record<string, StatusMeaning> = {
  // lifecycle
  DRAFT: "neutral",
  PLANNED: "neutral",
  NOT_STARTED: "neutral",
  PENDING: "waiting",
  SUBMITTED: "waiting",
  AWAITING_APPROVAL: "waiting",
  APPROVED: "active",
  ORDERED: "active",
  PARTIAL: "active",
  IN_PROGRESS: "active",
  ACTIVE: "active",
  ASSIGNED: "active",
  UNDER_CONSTRUCTION: "active",
  IN_MAINTENANCE: "waiting",
  ON_HOLD: "alert",
  HOLD: "waiting",
  BLOCKED: "alert",
  OVERDUE: "alert",
  LOW_STOCK: "alert",
  RECEIVED: "good",
  COMPLETED: "good",
  COMPLETE: "good",
  CLOSED: "good",
  PAID: "good",
  PROCESSED: "good",
  SOLD: "bad",
  AVAILABLE: "good",
  CONFIRMED: "good",
  PARTITIONED: "neutral",
  BOOKED: "active",
  RENTED: "active",
  CANCELLED: "bad",
  REJECTED: "bad",
  DEPOSIT_RECEIVED: "waiting",
  RETIRED: "neutral",
  ABSENT: "bad",
  PRESENT: "good",
  HALF_DAY: "active",
  OVERTIME: "active",
  LEAVE: "neutral",
  // additional lifecycle statuses
  ISSUED: "active",
  VERIFIED: "active",
  CONVERTED: "good",
  EXPIRED: "bad",
  SYNCED: "good",
  SYNC_FAILED: "bad",
  LISTED: "active",
  DELISTED: "neutral",
  INACTIVE: "neutral",
  WAIVED: "neutral",
  RELEASED: "good",
  BILLED: "good",
  UNBILLED: "neutral",
  MEASURED: "active",
  SUPERSEDED: "neutral",
  RETURNED: "good",
};

const STATUS_STYLES = {
  neutral: "border-border-strong bg-muted text-muted-foreground",
  active: "border-info-border bg-info-soft text-info",
  waiting: "border-warning-border bg-warning-soft text-warning",
  good: "border-success-border bg-success-soft text-success",
  bad: "border-danger-border bg-danger-soft text-danger",
  alert: "border-danger-border bg-danger-soft text-danger",
} as const;

/**
 * The raw CSS colour for a status's meaning — for dots, 2px rails and
 * left-border accents where a pill would be too heavy. Draws from the
 * SAME map as `StatusPill`, so a dot and a pill for the same status can
 * never disagree.
 */
type StatusMeaning = "neutral" | "active" | "waiting" | "good" | "bad" | "alert";

const MEANING_COLOR: Record<StatusMeaning, string> = {
  neutral: "var(--color-muted-foreground)",
  active: "var(--color-info)",
  waiting: "var(--color-warning)",
  good: "var(--color-success)",
  bad: "var(--color-danger)",
  alert: "var(--color-danger)",
};

export function statusColor(status: string): string {
  const meaning: StatusMeaning = STATUS_MEANING[status.toUpperCase()] ?? "neutral";
  return MEANING_COLOR[meaning];
}

/** The meaning group for a status — useful when a view branches on it. */
export function statusMeaning(status: string): string {
  return STATUS_MEANING[status.toUpperCase()] ?? "neutral";
}

/** Human-readable label from a SCREAMING_SNAKE status. */
export function humanStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meaning = STATUS_MEANING[status.toUpperCase()] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-2",
        "text-[11px] font-medium leading-none",
        STATUS_STYLES[meaning],
        className,
      )}
    >
      {/* A dot as well as colour — colour alone fails for ~8% of men */}
      <span className="size-[5px] shrink-0 rounded-full bg-current" />
      {humanStatus(status)}
    </span>
  );
}

// ── Guidance ──────────────────────────────────────────────────────

/**
 * A one-line explanation attached to a control or a screen. Used when
 * a page does something non-obvious ("Issuing goes to the project, not
 * the unit — unit cost is allocated per sq ft afterwards").
 *
 * We say it inline, once, where the decision is made. Not in a manual.
 */
export function Hint({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-meta leading-relaxed",
        tone === "warning" ? "text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  );
}

// ── Callout ───────────────────────────────────────────────────────

const CALLOUT_TONES = {
  info: "border-info-border bg-info-soft/50 text-foreground [&_svg]:text-info",
  warning: "border-warning-border bg-warning-soft/50 text-foreground [&_svg]:text-warning",
  danger: "border-danger-border bg-danger-soft/50 text-foreground [&_svg]:text-danger",
  success: "border-success-border bg-success-soft/50 text-foreground [&_svg]:text-success",
} as const;

/**
 * A banner that states a condition and offers the fix. This is where
 * "4 materials are below reorder point → Create requisition" lives.
 *
 * The rule: a callout must always carry an action, or it is nagging. If
 * there is nothing the reader can do about it, it belongs in a report,
 * not on top of their screen.
 */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-3",
        CALLOUT_TONES[tone],
        className,
      )}
    >
      {icon && <span className="shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="text-body font-semibold">{title}</p>}
        {children && (
          <div className={cn("text-meta leading-relaxed text-muted-foreground", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────

/**
 * Loading is a *shape*, not a spinner. A skeleton that matches the
 * layout it's replacing means the page doesn't reflow when data lands,
 * and the user starts reading the structure before the content arrives.
 */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-3.5"
              style={{
                width: c === 0 ? "28%" : `${Math.max(9, 18 - c * 2)}%`,
                // Stagger the sweep so the rows don't pulse in lockstep,
                // which reads as a broken animation rather than loading.
                animationDelay: `${(r * cols + c) * 60}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetrics({ cols = 4 }: { cols?: 2 | 3 | 4 | 5 }) {
  return (
    <MetricGrid cols={cols}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 p-4">
          <div className="skeleton h-2.5 w-20" />
          <div className="skeleton h-6 w-28" style={{ animationDelay: `${i * 80}ms` }} />
        </div>
      ))}
    </MetricGrid>
  );
}
