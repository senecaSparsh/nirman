import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Info, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { MobileStatusBadge } from "./primitives";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE DETAIL PRIMITIVES — shared building blocks for /m/{module}/[id] pages

   Every detail page hand-rolls the same 6 patterns with slightly different
   dimensions. This file standardises them so detail pages are consistent:

     1. DetailHeroCard    — icon + title + status + links (the identity card)
     2. DetailProgress    — labeled progress bar with tone colors
     3. DetailKeyValue    — label/value row pair (the most repeated pattern)
     4. DetailAlertBanner — colored alert/warning/success/info banner
     5. DetailStatGrid    — responsive stat grid with consistent spacing
     6. DetailTimeline    — vertical timeline tracker

   Design rules (from primitives.tsx):
   - 56px touch targets (gloved hands in sunlight)
   - Borders over shadows (hairlines survive direct sunlight)
   - Tabular numerals everywhere (prices/quantities are the content)
   - Sturdy 10-14px radii (not pills, not squares)
   - High contrast — amber+ink, never amber+white
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── DetailHeroCard ───────────────────────────────────────────────────────

/**
 * The identity card at the top of every detail page.
 *
 * Pattern: icon plate (left) + title + subtitle/link (center) + status badge
 * + optional action (right). Below: optional children for links, alerts,
 * pipeline stepper, progress bar, etc.
 *
 * Standardised from procurement/[id], projects/[id], materials/[id], etc.
 */
export function DetailHeroCard({
  icon: Icon,
  title,
  titleMono,
  subtitle,
  subtitleHref,
  status,
  action,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  /** Use monospace for document numbers (PO-20250115-0001). */
  titleMono?: boolean;
  subtitle?: string;
  subtitleHref?: string;
  /** Status string — rendered via MobileStatusBadge. */
  status?: string;
  /** Optional action node (Print button, Edit button, etc). */
  action?: React.ReactNode;
  /** Optional content below the header row (links, alerts, progress). */
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[0.875rem] border p-3.5 mb-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div
            className="grid place-items-center w-11 h-11 rounded-[0.625rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Icon className="size-5" style={{ color: "var(--color-ink-700)" }} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className={`font-bold text-m-section leading-tight ${titleMono ? "font-mono" : ""}`}
            style={{ color: "var(--color-ink-950)" }}
          >
            {title}
          </h1>
          {subtitle && subtitleHref ? (
            <Link
              href={subtitleHref}
              className="text-m-body mt-0.5 underline underline-offset-2 text-m-body press block truncate"
              style={{ color: "var(--color-ink-500)" }}
            >
              {subtitle}
            </Link>
          ) : subtitle ? (
            <p className="text-m-body mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {status && <MobileStatusBadge status={status} />}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── DetailProgress ───────────────────────────────────────────────────────

/**
 * Labeled progress bar with tone-based fill color.
 *
 * Pattern: label (left) + value (right) above a bar that fills based on pct.
 * Below: percentage + optional pending count.
 *
 * Standardised from procurement/[id] (receive progress), projects/[id]
 * (completion progress), boq/[id] (quantity progress).
 */
export function DetailProgress({
  label,
  value,
  pct,
  hint,
  tone = "auto",
}: {
  label: string;
  /** Display value shown on the right (e.g. "12/20 units"). */
  value?: string;
  /** 0-100. Clamped to [0, 100]. */
  pct: number;
  /** Optional hint below the bar (e.g. "3 pending"). */
  hint?: string;
  /** Auto picks color based on pct: 100=go, >0=signal, 0=steel. */
  tone?: "auto" | "go" | "signal" | "stop" | "steel";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillColor =
    tone === "auto"
      ? clamped >= 100
        ? "var(--color-go)"
        : clamped > 0
          ? "var(--color-signal)"
          : "var(--color-steel)"
      : tone === "go"
        ? "var(--color-go)"
        : tone === "signal"
          ? "var(--color-signal)"
          : tone === "stop"
            ? "var(--color-stop)"
            : "var(--color-steel)";

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          {label}
        </span>
        {value && (
          <span className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {value}
          </span>
        )}
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: fillColor }}
        />
      </div>
      {hint && (
        <p className="text-m-caption mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── DetailKeyValue ───────────────────────────────────────────────────────

/**
 * Label/value row pair — the most repeated pattern in detail pages.
 *
 * Pattern: label (left, muted) + value (right, bold, tabular for numbers).
 * Used in "Details" sections, "Summary" cards, and metadata strips.
 *
 * Standardised from every [id] page's "Details" section.
 */
export function DetailKeyValue({
  label,
  value,
  mono,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  /** Monospace for codes, numbers, IDs. */
  mono?: boolean;
  tone?: "default" | "go" | "stop" | "signal";
}) {
  const valueColor = {
    default: "var(--color-ink-950)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-m-caption font-semibold shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </dt>
      <dd
        className={`text-m-body font-bold text-right truncate ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: valueColor }}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * A group of DetailKeyValue pairs inside a bordered card with a title.
 * This is the "Details" or "Summary" section that every detail page has.
 */
export function DetailKeyValueCard({
  title,
  entries,
  action,
}: {
  title?: string;
  entries: { label: string; value: React.ReactNode; mono?: boolean; tone?: "default" | "go" | "stop" | "signal" }[];
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[0.625rem] border p-3 mb-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {title && (
        <div className="flex items-center justify-between mb-1">
          <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
            {title}
          </p>
          {action}
        </div>
      )}
      <dl className="divide-y" style={{ borderColor: "var(--color-line)" }}>
        {entries.map((e, i) => (
          <DetailKeyValue key={i} label={e.label} value={e.value} mono={e.mono} tone={e.tone} />
        ))}
      </dl>
    </div>
  );
}

// ─── DetailAlertBanner ────────────────────────────────────────────────────

/**
 * Colored alert banner for warnings, errors, success, and info.
 *
 * Pattern: icon + title + optional description, with a tinted background
 * and matching border. Used for overdue alerts, rejection notices,
 * approval confirmations, etc.
 *
 * Standardised from procurement/[id] (rejection banner, overdue alert),
 * materials/[id] (low stock warning), work-orders/[id] (delay alert).
 */
export function DetailAlertBanner({
  tone = "warning",
  title,
  description,
  children,
}: {
  tone?: "warning" | "danger" | "success" | "info";
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  const config = {
    warning: {
      icon: AlertTriangle,
      bg: "color-mix(in srgb, var(--color-signal) 8%, transparent)",
      border: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
      color: "var(--color-signal-dark)",
    },
    danger: {
      icon: XCircle,
      bg: "color-mix(in srgb, var(--color-stop) 5%, transparent)",
      border: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
      color: "var(--color-stop)",
    },
    success: {
      icon: CheckCircle2,
      bg: "color-mix(in srgb, var(--color-go) 5%, transparent)",
      border: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
      color: "var(--color-go)",
    },
    info: {
      icon: Info,
      bg: "color-mix(in srgb, var(--color-steel) 5%, transparent)",
      border: "color-mix(in srgb, var(--color-steel) 30%, var(--color-line))",
      color: "var(--color-steel)",
    },
  }[tone];

  const Icon = config.icon;

  return (
    <div
      className="rounded-[0.5rem] border p-2.5 mb-2.5"
      style={{ borderColor: config.border, backgroundColor: config.bg }}
    >
      <div className="flex items-start gap-2">
        <Icon className="size-4 shrink-0 mt-0.5" style={{ color: config.color }} />
        <div className="min-w-0 flex-1">
          <p className="text-m-body font-bold" style={{ color: config.color }}>
            {title}
          </p>
          {description && (
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-700)" }}>
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── DetailStatGrid ───────────────────────────────────────────────────────

/**
 * Responsive stat grid for detail pages.
 *
 * Pattern: 2-col or 4-col grid of stat cards with label, value, and
 * optional tone color. Used in the "Summary" or "Overview" section.
 *
 * Standardised from procurement/[id] (KPI strip), projects/[id] (budget
 * grid), materials/[id] (stock overview), etc.
 */
export function DetailStatGrid({
  stats,
  cols = 2,
}: {
  stats: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal"; icon?: LucideIcon }[];
  cols?: 2 | 3 | 4;
}) {
  const toneColor = (tone?: string) =>
    tone === "go"
      ? "var(--color-go)"
      : tone === "stop"
        ? "var(--color-stop)"
        : tone === "signal"
          ? "var(--color-signal-dark)"
          : "var(--color-ink-950)";

  const gridCls =
    cols === 4
      ? "grid grid-cols-4 gap-1.5 mb-3"
      : cols === 3
        ? "grid grid-cols-3 gap-1.5 mb-3"
        : "grid grid-cols-2 gap-2 mb-3";

  return (
    <div className={gridCls}>
      {stats.map((s, i) => (
        <div
          key={i}
          className="rounded-[0.5rem] border p-2 text-m-body overflow-hidden min-w-0"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        >
          <p className="text-m-label mb-1 truncate" style={{ color: "var(--color-ink-500)" }}>
            {s.label}
          </p>
          <p className="text-m-figure truncate" style={{ color: toneColor(s.tone) }}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── DetailTimeline ───────────────────────────────────────────────────────

/**
 * Vertical timeline tracker — Amazon-style status tracker.
 *
 * Pattern: vertical line with dots for each step. Done steps are filled,
 * current step is highlighted, pending steps are outlined. Each step has
 * a label, optional date, and optional detail.
 *
 * Standardised from procurement/[id] (tracking timeline), work-orders/[id]
 * (status timeline), stock-counts/[id] (count timeline).
 */
export interface TimelineStepData {
  label: string;
  date?: string;
  detail?: string;
  state: "done" | "current" | "pending" | "cancelled";
  color?: string;
}

export function DetailTimeline({
  steps,
  title = "Tracking",
}: {
  steps: TimelineStepData[];
  title?: string;
}) {
  return (
    <div
      className="rounded-[0.625rem] border p-3 mb-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="text-m-caption font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-steel)" }}>
        {title}
      </p>
      <div className="relative pl-6">
        {/* Vertical connector line */}
        <div
          className="absolute left-[7px] top-1 bottom-1 w-px"
          style={{ backgroundColor: "var(--color-line)" }}
        />
        {steps.map((step, i) => (
          <TimelineRow key={i} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({ step, isLast }: { step: TimelineStepData; isLast: boolean }) {
  const dotColor =
    step.state === "done"
      ? step.color ?? "var(--color-go)"
      : step.state === "current"
        ? "var(--color-signal)"
        : step.state === "cancelled"
          ? "var(--color-stop)"
          : "transparent";

  const borderColor =
    step.state === "done"
      ? step.color ?? "var(--color-go)"
      : step.state === "current"
        ? "var(--color-signal)"
        : step.state === "cancelled"
          ? "var(--color-stop)"
          : "var(--color-ink-300)";

  const labelColor =
    step.state === "done"
      ? "var(--color-ink-950)"
      : step.state === "current"
        ? "var(--color-ink-950)"
        : step.state === "cancelled"
          ? "var(--color-stop)"
          : "var(--color-ink-400)";

  return (
    <div className={`relative ${isLast ? "" : "pb-4"}`}>
      {/* Dot */}
      <div
        className="absolute -left-6 top-0.5 flex items-center justify-center rounded-full border"
        style={{
          width: 14,
          height: 14,
          borderColor,
          backgroundColor: dotColor,
          borderWidth: 1.5,
          borderStyle: step.state === "pending" ? "dashed" : "solid",
        }}
      >
        {step.state === "done" && (
          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-paper)" }} />
        )}
        {step.state === "current" && (
          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-ink-950)" }} />
        )}
      </div>
      {/* Content */}
      <p className="text-m-body font-bold" style={{ color: labelColor }}>
        {step.label}
      </p>
      {step.date && (
        <p className="text-m-caption mt-0.5 tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {step.date}
        </p>
      )}
      {step.detail && (
        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-700)" }}>
          {step.detail}
        </p>
      )}
    </div>
  );
}

// ─── DetailLinkRow ────────────────────────────────────────────────────────

/**
 * A link row inside a detail card — icon + label + chevron.
 *
 * Pattern: used for "Related to" links, project links, supplier links,
 * source document links, etc.
 *
 * Standardised from procurement/[id] (project link, requisition link),
 * projects/[id] (manager link, supervisor link), etc.
 */
export function DetailLinkRow({
  href,
  icon: Icon,
  label,
  tone = "steel",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: "steel" | "signal" | "go" | "stop";
}) {
  const color = {
    steel: "var(--color-steel)",
    signal: "var(--color-signal-dark)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
  }[tone];

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-m-label mt-2 text-m-body press"
      style={{ color }}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate underline underline-offset-2">{label}</span>
    </Link>
  );
}

// ─── DetailPrintButton ────────────────────────────────────────────────────

/**
 * Standard "Print" button for detail pages.
 *
 * Pattern: small bordered button with printer icon, opens print view in
 * new tab. Standardised from procurement/[id], work-orders/[id], etc.
 */
export function DetailPrintButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-m-body font-semibold px-2.5 py-1 rounded-[0.5rem] border text-m-body press shrink-0"
      style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Print
    </a>
  );
}
