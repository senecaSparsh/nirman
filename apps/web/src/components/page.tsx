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

/** The page's vertical rhythm. Use this instead of ad-hoc space-y-*. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

// ── Section ───────────────────────────────────────────────────────

/**
 * A titled block. `bare` drops the card chrome for content that is
 * already visually contained (a table with its own borders, a chart).
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
    <section className={className}>
      {(title || action) && (
        <div className="mb-2.5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-section text-foreground">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {bare ? (
        children
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">{children}</div>
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
        "flex flex-wrap items-center gap-2 border border-border bg-subtle px-3 py-2",
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
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-5",
  }[cols];

  return (
    <div
      className={cn(
        "grid divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x",
        "divide-y sm:divide-y-0",
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
    <div className="flex h-full flex-col gap-1.5 p-4">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground/50 [&_svg]:size-3.5">{icon}</span>}
        <span className="text-label text-muted-foreground/75">{label}</span>
        {provenance && (
          <span title={provenance} className="text-muted-foreground/35 transition-colors hover:text-muted-foreground">
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <span className={cn("text-figure", METRIC_TONES[tone])}>{value}</span>
      {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
      {href && (
        <span className="mt-auto flex items-center gap-0.5 pt-1 text-caption font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
          View <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block transition-colors hover:bg-subtle">
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
        <span className="text-label text-muted-foreground/70">{label}</span>
        {provenance && (
          <span title={provenance} className="text-muted-foreground/35">
            <Info className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      <div className={cn("mt-0.5 text-body font-semibold tnum", METRIC_TONES[tone])}>{value}</div>
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
  HOLD: "alert",
  BLOCKED: "alert",
  OVERDUE: "alert",
  LOW_STOCK: "alert",
  RECEIVED: "good",
  COMPLETED: "good",
  COMPLETE: "good",
  CLOSED: "good",
  PAID: "good",
  PROCESSED: "good",
  SOLD: "good",
  AVAILABLE: "good",
  CONFIRMED: "good",
  PARTITIONED: "good",
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
  neutral: "bg-muted text-muted-foreground",
  active: "bg-info-soft text-info",
  waiting: "bg-warning-soft text-warning",
  good: "bg-success-soft text-success",
  bad: "bg-danger-soft text-danger",
  alert: "bg-danger-soft text-danger",
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
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-caption font-medium leading-tight whitespace-nowrap",
        STATUS_STYLES[meaning],
        className,
      )}
    >
      {/* A dot as well as colour — colour alone fails for ~8% of men */}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
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
        "flex items-start gap-1.5 text-caption leading-relaxed",
        tone === "warning" ? "text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-px h-3 w-3 shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  );
}
