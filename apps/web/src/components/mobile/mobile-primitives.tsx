"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, RotateCw, X, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Mobile primitives for the /m surfaces.
 *
 * Same design language as desktop — same tokens, same status colours —
 * but sized for a 375px screen. The desktop type scale (22px titles,
 * 19px figures) is too large on a phone; these primitives use a tighter
 * mobile scale that keeps the 44px tap-target minimum but strips waste
 * above it.
 *
 *   1. 48px rows (44px minimum tap target + 4px breathing room).
 *   2. 32px icon containers (not 36px — less visual weight per row).
 *   3. 15px stat values (not 19px — fits 2-col grids on narrow screens).
 *   4. 17px page titles (not 22px — the header is not the content).
 */

/** Sticky page header for mobile screens. */
export function MobilePageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border bg-background px-4 pb-2 pt-3">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold leading-tight text-foreground">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-caption leading-snug text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * Detail/drill-in header with a back chevron. Used on pages reached by
 * tapping a row (PO detail, material detail, etc.) where the user needs
 * a way back. `backHref` is required — point it at the list the user
 * came from. Kept as a server component (Link, no router hook) so it can
 * sit in the same module as the other primitives.
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
    <div className="flex items-center gap-2 border-b border-border bg-background px-2 py-2.5">
      <Link href={backHref} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent" aria-label="Back">
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold leading-tight text-foreground">{title}</h1>
        {subtitle && <p className="truncate text-caption leading-snug text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Section divider with a small label. */
export function MobileSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pb-1 pt-3.5 text-label text-muted-foreground/75">{children}</h2>
  );
}

/** A KPI / stat tile for persona home screens. */
export function MobileStatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
  icon?: LucideIcon;
}) {
  const toneColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-label text-muted-foreground/75">{label}</span>
        {Icon && <Icon className={cn("h-3 w-3 shrink-0 opacity-60", toneColor)} />}
      </div>
      <div className={cn("mt-1 text-[15px] font-semibold leading-tight tnum", toneColor)}>{value}</div>
      {hint && <div className="mt-0.5 text-caption text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** A tappable list row that navigates to href. */
export function MobileRow({
  href,
  icon: Icon,
  title,
  subtitle,
  meta,
  badge,
  tone,
}: {
  href: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const metaTone =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-danger"
        : tone === "success"
          ? "text-success"
          : "text-muted-foreground";
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
    >
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-foreground">{title}</div>
        {subtitle && (
          <div className="truncate text-caption text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {badge != null && badge !== "" && (
        typeof badge === "string" || typeof badge === "number" ? (
          <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-caption font-semibold tnum text-brand">
            {badge}
          </span>
        ) : (
          <span className="shrink-0">{badge}</span>
        )
      )}
      {meta && <span className={cn("shrink-0 text-meta font-medium tnum", metaTone)}>{meta}</span>}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
    </Link>
  );
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
  value: string;
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
    <div className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body">{title}</div>
        {subtitle && <div className="truncate text-caption text-muted-foreground">{subtitle}</div>}
      </div>
      {badge != null && badge !== "" && <span className="shrink-0">{badge}</span>}
      <span className={cn("shrink-0 text-body font-semibold tnum", toneColor)}>{value}</span>
    </div>
  );
}

/** Empty-state placeholder. */
export function MobileEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon && (
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground/55">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <p className="text-meta font-semibold text-foreground">{title}</p>
      {hint && (
        <p className="mt-0.5 max-w-xs text-caption leading-relaxed text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Primary full-width action button (44px tap target). Always navigates —
 *  for actions (onClick) use a dedicated client component instead. */
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
    "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.99]",
    variant === "primary"
      ? "bg-primary text-primary-foreground shadow-raised"
      : "border border-border bg-card text-foreground",
  );
  return (
    <Link href={href} className={cls}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </Link>
  );
}

/* ============================================================
 * Interactive list primitives — search, filter chips, status
 * badges, refresh. These are client components so they can hold
 * useState for search query / active filter. They are designed to
 * be dropped into any mobile list page that wraps its data in a
 * client component.
 * ============================================================ */

/**
 * Search bar with a magnifier icon and clear button. Controlled
 * component — parent owns the `value` and `onChange`. Filters
 * client-side by whatever fields the parent chooses.
 */
export function MobileSearchBar({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground active:scale-95"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontally scrollable filter chips. `chips` is an array of
 * { label, value } pairs — the first chip should be the "All"
 * option with value "ALL". The parent owns `active` and `onChange`.
 */
export function MobileFilterChips<T extends string>({
  chips,
  active,
  onChange,
}: {
  chips: { label: string; value: T }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-caption font-semibold transition-colors active:scale-95",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

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
export function MobileStatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const variant = STATUS_VARIANT[status] ?? "muted";
  return (
    <Badge variant={variant} className="shrink-0">
      {label ?? titleCaseStatus(status)}
    </Badge>
  );
}

/**
 * Refresh button for the page header `right` slot. Calls
 * `router.refresh()` which re-fetches server component data
 * without a full page reload — the Next.js equivalent of
 * pull-to-refresh.
 */
export function MobileRefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent active:scale-95"
      aria-label="Refresh"
    >
      <RotateCw className="h-4 w-4" />
    </button>
  );
}

/**
 * Floating action button (FAB) for quick-create on mobile list pages.
 * Fixed to the bottom-right, sitting above the bottom tab bar
 * (3.5rem nav + safe-area inset). Only add to list pages that have a
 * sensible mobile create target.
 */
export function MobileFab({
  href,
  icon: Icon = Plus,
  label = "Create",
}: {
  href: string;
  icon?: LucideIcon;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised transition-transform active:scale-95"
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
}
