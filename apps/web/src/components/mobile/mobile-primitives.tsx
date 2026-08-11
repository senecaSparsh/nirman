import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Re-export interactive client primitives so existing imports from
// "@/components/mobile/mobile-primitives" continue to work.
export {
  MobileSearchBar,
  MobileFilterChips,
  MobileRefreshButton,
} from "./mobile-primitives-client";

/**
 * ═══════════════════════════════════════════════════════════════════
 * MOBILE PRIMITIVES — the /m surface.
 *
 * Same design language as desktop — same tokens, same status colours —
 * but this is not desktop-lite. For a SUPERVISOR this *is* the product,
 * used one-handed, outdoors, in glare, often with a glove on.
 *
 * The rules that differ from desktop:
 *
 *   1. 56px rows, not 48px. The 44px "minimum" is a minimum for a
 *      seated user with a clean screen; on site it is a miss.
 *   2. Body text is 14px, not 13px. One step up buys legibility at
 *      arm's length in sunlight and costs one row per screen.
 *   3. The number goes on the right, in mono, and is the second thing
 *      the eye lands on after the name. Quantities and money are what
 *      these screens are *for*.
 *   4. Rows are full-bleed with hairline separators, not a stack of
 *      inset cards. Cards on a 390px screen waste 32px of width per
 *      record on borders and gutters, and read as a list of boxes
 *      rather than a list of records.
 *   5. Every empty state offers the action, because the phone user is
 *      usually the one who creates the record.
 *
 * These components are shared (no "use client") so they can receive
 * lucide icon components from Server Components without serialization
 * errors. Interactive primitives (search, filter chips, refresh) live
 * in mobile-primitives-client.tsx.
 * ═══════════════════════════════════════════════════════════════════
 */

/** Page header for mobile screens. Sits under the shell's own header. */
export function MobilePageHeader({
  title,
  subtitle,
  right,
  stats,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /**
   * Up to three headline numbers. They render as a divided band directly
   * under the title, which is where a supervisor looks first — "how much
   * is left" before "what is in the list".
   */
  stats?: { label: string; value: string; tone?: "default" | "warning" | "danger" | "success" }[];
}) {
  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-meta leading-snug text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl className="flex items-stretch divide-x divide-border border-t border-border">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 flex-1 px-4 py-2.5">
              <dt className="truncate text-label text-muted-foreground">{s.label}</dt>
              <dd
                className={cn(
                  "mt-1 truncate text-[17px] font-semibold leading-none tnum",
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

/**
 * Detail/drill-in header with a back chevron. Used on pages reached by
 * tapping a row (PO detail, material detail, etc.). `backHref` is
 * required — point it at the list the user came from, because a phone
 * back gesture inside an installed PWA is not reliable.
 */
export function MobileDetailHeader({
  title,
  subtitle,
  backHref,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-2">
      <Link
        href={backHref}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
        aria-label="Back"
      >
        <ChevronLeft className="size-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-caption leading-snug text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * Section divider with a small label. Sticky, so when you're 40 rows
 * into a material list you still know which location you're looking at.
 */
export function MobileSectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-subtle/95 px-4 py-2 backdrop-blur-sm">
      <h2 className="min-w-0 truncate text-label text-muted-foreground">{children}</h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** A KPI / stat tile for persona home screens. */
export function MobileStatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  icon?: LucideIcon;
  /** Makes the whole tile tappable — a number you can't drill into is trivia. */
  href?: string;
}) {
  const toneColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : tone === "brand"
            ? "text-brand-strong"
            : "text-foreground";

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 shrink-0 text-faint" />}
        <span className="min-w-0 truncate text-label text-muted-foreground">{label}</span>
        {href && <ChevronRight className="ml-auto size-3.5 shrink-0 text-faint" />}
      </div>
      <div className={cn("mt-1.5 text-[20px] font-semibold leading-none tnum", toneColor)}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-caption leading-snug text-muted-foreground">{hint}</div>}
    </>
  );

  const cls =
    "flex min-h-[76px] flex-col rounded-lg border border-border bg-card p-3 transition-colors";

  if (href) {
    return (
      <Link href={href} className={cn(cls, "active:bg-subtle")}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/**
 * A tappable list row that navigates to href, or a display row if href
 * is omitted.
 *
 * `meta` is the trailing figure. It gets mono + semibold because on a
 * phone the value *is* the row — "TMT Steel 12mm" tells a supervisor
 * nothing without "2.5 t".
 */
export function MobileRow({
  href,
  icon: Icon,
  title,
  subtitle,
  meta,
  metaSub,
  badge,
  tone,
}: {
  /** When provided, the row is a link. When omitted, it's a display-only row. */
  href?: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  /** A second, quieter line under the trailing figure — a unit, a date. */
  metaSub?: string;
  badge?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "brand";
}) {
  const metaTone =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-danger"
        : tone === "success"
          ? "text-success"
          : tone === "brand"
            ? "text-brand-strong"
            : "text-foreground";

  const className =
    "flex min-h-14 items-center gap-3 border-b border-border bg-card px-4 py-2.5 transition-colors active:bg-subtle";

  const inner = (
    <>
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-snug text-foreground">{title}</div>
        {subtitle && (
          <div className="mt-0.5 truncate text-caption leading-snug text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {badge != null &&
        badge !== "" &&
        (typeof badge === "string" || typeof badge === "number" ? (
          <span className="shrink-0 rounded-full border border-brand-border bg-brand-soft px-2 py-0.5 text-caption font-semibold tabular-nums text-brand-strong">
            {badge}
          </span>
        ) : (
          <span className="shrink-0">{badge}</span>
        ))}
      {meta && (
        <span className="shrink-0 text-right">
          <span className={cn("block text-[14px] font-semibold leading-tight tnum", metaTone)}>
            {meta}
          </span>
          {metaSub && (
            <span className="mt-0.5 block text-caption leading-none text-muted-foreground">
              {metaSub}
            </span>
          )}
        </span>
      )}
      {href && <ChevronRight className="size-4 shrink-0 text-faint" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

/**
 * A record row that carries several comparable fields — the mobile
 * answer to a table row.
 *
 * A phone cannot show ten columns, but it can show the four that matter
 * as a label/value grid under the record's name. That keeps the data
 * *comparable down the list* (every row puts "Ordered" in the same
 * place), which is the property a card loses.
 */
export function MobileDataRow({
  href,
  title,
  subtitle,
  badge,
  fields,
  tone,
}: {
  href?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  /** 2–4 label/value pairs. More than four does not fit and does not help. */
  fields: { label: string; value: React.ReactNode; tone?: "default" | "warning" | "danger" | "success" }[];
  tone?: "default" | "warning" | "danger";
}) {
  const className = cn(
    "block border-b border-border px-4 py-3 transition-colors active:bg-subtle",
    tone === "danger"
      ? "bg-danger-soft/40"
      : tone === "warning"
        ? "bg-warning-soft/40"
        : "bg-card",
  );

  const inner = (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-snug text-foreground">
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate text-caption leading-snug text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {badge && <span className="shrink-0">{badge}</span>}
        {href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" />}
      </div>

      <dl
        className={cn(
          "mt-2.5 grid gap-x-3 gap-y-2",
          fields.length <= 2 ? "grid-cols-2" : fields.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase leading-none tracking-wide text-faint">
              {f.label}
            </dt>
            <dd
              className={cn(
                "mt-1 truncate text-[13px] font-semibold leading-none tnum",
                f.tone === "warning" && "text-warning",
                f.tone === "danger" && "text-danger",
                f.tone === "success" && "text-success",
                (!f.tone || f.tone === "default") && "text-foreground",
              )}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

/** A non-navigable row (e.g. a KPI line inside a list). */
export function MobileInfoRow({
  icon: Icon,
  title,
  subtitle,
  value,
  badge,
  tone,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneColor =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-danger"
        : tone === "success"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] leading-snug text-foreground">{title}</div>
        {subtitle && (
          <div className="mt-0.5 truncate text-caption leading-snug text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {badge != null && badge !== "" && <span className="shrink-0">{badge}</span>}
      <span className={cn("shrink-0 text-[14px] font-semibold tnum", toneColor)}>{value}</span>
    </div>
  );
}

/**
 * Empty-state placeholder.
 *
 * `action` matters more on mobile than anywhere else: the phone user is
 * usually the person who creates the missing record, so an empty screen
 * without a create button is a dead end at the exact moment they had the
 * material in front of them.
 */
export function MobileEmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <span className="mb-3 flex size-12 items-center justify-center rounded-xl border border-dashed border-border-strong bg-subtle text-faint">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {hint && (
        <p className="mt-1.5 max-w-xs text-meta leading-relaxed text-muted-foreground">{hint}</p>
      )}
      {action && <div className="mt-4 w-full max-w-64">{action}</div>}
    </div>
  );
}

/**
 * Primary full-width action button (48px tap target). Always navigates —
 * for actions (onClick) use a dedicated client component instead.
 *
 * No press-scale: a control that shrinks under the thumb reads as
 * playful, and this one books a stock movement.
 */
export function MobileCta({
  href,
  icon: Icon,
  children,
  variant = "primary",
}: {
  href: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  const cls = cn(
    "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-colors",
    variant === "primary"
      ? "bg-primary text-primary-foreground shadow-raised active:bg-primary/90"
      : "border border-input bg-card text-foreground active:bg-muted",
  );
  return (
    <Link href={href} className={cls}>
      {Icon && <Icon className="size-4" />}
      {children}
    </Link>
  );
}

/**
 * A docked action bar for detail screens — the confirm/reject pair on an
 * approval, the "Receive" on a PO. Pinned to the bottom above the tab
 * bar, because on a long record the action must not be at the end of a
 * scroll the user has to find.
 */
export function MobileActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-xl">
      {children}
    </div>
  );
}

/* ============================================================
 * Status badge — pure render, no hooks. Kept here as a shared
 * component so Server Components can use it directly.
 * ============================================================ */

/** Map a raw status string (e.g. "DRAFT", "SUBMITTED") to a
 *  Badge variant with the right semantic colour. */
const STATUS_VARIANT: Record<string, "default" | "brand" | "success" | "warning" | "danger" | "info" | "muted"> = {
  DRAFT: "warning",
  SUBMITTED: "info",
  PENDING: "warning",
  PARTIAL: "warning",
  APPROVED: "success",
  ORDERED: "info",
  IN_TRANSIT: "info",
  RECEIVED: "success",
  COMPLETED: "success",
  COUNTED: "info",
  RECONCILED: "success",
  ACTIVE: "success",
  PAID: "success",
  PROCESSED: "info",
  CANCELLED: "danger",
  REJECTED: "danger",
  ON_HOLD: "warning",
  PLANNED: "info",
  // Project / unit / DPR statuses
  UNDER_CONSTRUCTION: "info",
  AVAILABLE: "success",
  HOLD: "warning",
  SOLD: "success",
  PARTITIONED: "info",
  RENTED: "brand",
  BOOKED: "warning",
  SUB_ADMIN_APPROVED: "info",
  // Tenancy statuses
  ENDED: "muted",
  // Payment / rental-payment statuses
  OVERDUE: "danger",
  // Portal listing statuses
  LISTED: "success",
  DELISTED: "muted",
  SYNC_FAILED: "danger",
  CLEAR: "success",
  // Attendance statuses
  PRESENT: "success",
  ABSENT: "danger",
  HALF_DAY: "warning",
  LEAVE: "info",
  OVERTIME: "brand",
  // Equipment statuses
  ASSIGNED: "info",
  IN_MAINTENANCE: "warning",
  RETIRED: "muted",
  // Task statuses
  IN_PROGRESS: "info",
  BLOCKED: "danger",
  // Wage types
  DAILY: "info",
  MONTHLY: "brand",
};

/** Title-case a status enum value: "IN_TRANSIT" → "In Transit". */
function titleCaseStatus(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Coloured status badge. Pass any raw enum value (DRAFT, SUBMITTED,
 * COMPLETED, CANCELLED, …) and it renders a Badge with the correct
 * semantic colour and a human-readable label. Falls back to the
 * `muted` variant for unknown statuses.
 */
export function MobileStatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = STATUS_VARIANT[status] ?? "muted";
  return (
    <Badge variant={variant} dot className="shrink-0">
      {label ?? titleCaseStatus(status)}
    </Badge>
  );
}

/**
 * Floating action button (FAB) for quick-create on mobile list pages.
 * Fixed to the bottom-right, sitting above the bottom tab bar.
 *
 * 56px and labelled: an unlabelled circle is a guess, and the label is
 * what makes this reachable without looking at the screen twice.
 */
export function MobileFab({
  href,
  icon: Icon = Plus,
  label = "Create",
  showLabel = true,
}: {
  href: string;
  icon?: LucideIcon;
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-20 flex items-center gap-2",
        "bg-primary text-primary-foreground shadow-overlay transition-colors active:bg-primary/90",
        showLabel ? "h-13 rounded-full px-5" : "size-14 justify-center rounded-full",
      )}
    >
      <Icon className="size-5 shrink-0" />
      {showLabel && <span className="text-[15px] font-semibold">{label}</span>}
    </Link>
  );
}
