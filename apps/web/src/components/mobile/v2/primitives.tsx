import * as React from "react";
import Link from "next/link";
import { ChevronRight, Lock, type LucideIcon } from "lucide-react";
import { statusMeaning } from "@/components/page";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE V2 PRIMITIVES — "site-grade" warm palette

   Adapted from Nirman OS's UI components (components/ui/index.tsx) to
   work within Nirman Inventory's Tailwind v4 setup. Uses the warm
   tokens added to globals.css (--color-ink-*, --color-paper*,
   --color-concrete, --color-signal*, --color-go*, --color-stop*).

   Design rules (from Nirman OS):
   - 56px touch targets (gloved hands in sunlight)
   - Borders over shadows (hairlines survive direct sunlight)
   - Tabular numerals everywhere (prices/quantities are the content)
   - Sturdy 10-12px radii (not pills, not squares)
   - High contrast — amber+ink, never amber+white
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Button ────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "signal" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "lg" | "xl";

const BUTTON_VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", borderColor: "var(--color-ink-950)" },
  signal: { backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)", borderColor: "var(--color-signal-active)", fontWeight: 700 },
  secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)", borderColor: "var(--color-line)" },
  ghost: { backgroundColor: "transparent", color: "var(--color-ink-700)", borderColor: "transparent" },
  danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-m-section",
  lg: "h-12 px-5 text-m-section",
  xl: "h-14 px-6 text-m-section font-bold",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[0.625rem] border-2",
        "font-semibold transition-colors select-none active:opacity-80 press",
        "disabled:opacity-40 disabled:pointer-events-none",
        BUTTON_SIZES[size],
        fullWidth && "w-full",
        className ?? "",
      ].filter(Boolean).join(" ")}
      style={{ ...BUTTON_VARIANTS[variant], ...style }}
    />
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

export function Card({
  className,
  as: Tag = "div",
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }) {
  return (
    <Tag
      {...props}
      className={["border rounded-[0.875rem]", className ?? ""].filter(Boolean).join(" ")}
      style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)", ...style }}
    />
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────

type BadgeTone = "neutral" | "signal" | "go" | "stop" | "steel";

const BADGE_TONES: Record<BadgeTone, React.CSSProperties> = {
  neutral: { backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" },
  signal: { backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" },
  go: { backgroundColor: "var(--color-go-wash)", color: "var(--color-go)" },
  stop: { backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" },
  steel: { backgroundColor: "var(--color-steel-wash)", color: "var(--color-steel)" },
};

export function Badge({
  tone = "neutral",
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={[
        "inline-flex items-center gap-1 rounded-[0.375rem] px-2 py-0.5",
        "text-m-label",
        className ?? "",
      ].filter(Boolean).join(" ")}
      style={{ ...BADGE_TONES[tone], ...style }}
    />
  );
}

// ─── Stat ──────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "go" | "stop" | "signal";
}) {
  const toneColor = {
    neutral: "var(--color-ink-950)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  }[tone];

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </dt>
      <dd className="text-m-figure" style={{ color: toneColor }}>
        {value}
      </dd>
      {hint ? (
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{hint}</p>
      ) : null}
    </div>
  );
}

// ─── Section heading ───────────────────────────────────────────────────────

export function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1.5">
      <h2 className="text-m-section" style={{ color: "var(--color-ink-950)" }}>
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── Bottom action bar ─────────────────────────────────────────────────────

export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-4 pt-2.5 pb-safe"
      style={{
        /* Apple §12 — match the bottom nav's translucent material so
           stacked bars (nav + action) read as one glass layer, not two
           different surfaces. */
        backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid color-mix(in srgb, var(--color-paper) 60%, transparent)",
      }}
    >
      <div className="mx-auto w-full max-w-[34rem]">{children}</div>
    </div>
  );
}

// ─── Spinner ────────────────────────────────────────────────────────────────

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={["spinner", className ?? ""].filter(Boolean).join(" ")}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Mobile list row (warm style — card with gap, not border-bottom) ───────

export function MobileRow({
  href,
  icon: Icon,
  title,
  subtitle,
  meta,
  metaSub,
  badge,
  tone = "default",
  empId,
}: {
  href?: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  metaSub?: string;
  badge?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
  /** Employee ID — when set, the title gets `data-emp-id` so double-click navigates to the profile. */
  empId?: string;
}) {
  const toneColor = {
    default: "var(--color-ink-500)",
    warning: "var(--color-signal-dark)",
    danger: "var(--color-stop)",
    success: "var(--color-go)",
  }[tone];

  const content = (
    <>
      {Icon && (
        <span className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
          <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-m-strong"
          style={{ color: "var(--color-ink-950)", ...(empId ? { cursor: "pointer" } : {}) }}
          {...(empId ? { "data-emp-id": empId } : {})}
        >
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {badge}
      {meta && (
        <div className="shrink-0 text-right max-w-[40%]">
          <p className="text-m-strong tabular-nums truncate" style={{ color: toneColor }}>
            {meta}
          </p>
          {metaSub && (
            <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-300)" }}>
              {metaSub}
            </p>
          )}
        </div>
      )}
      {href && <ChevronRight className="shrink-0 size-3.5" style={{ color: "var(--color-ink-300)" }} />}
    </>
  );

  const cls = "flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 text-m-body press";

  if (href) {
    return (
      <Link href={href} className={cls} style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        {content}
      </Link>
    );
  }
  return (
    <div className={cls} style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      {content}
    </div>
  );
}

// ─── Mobile stat card (warm style — matches Nirman OS Card p-3) ────────────

export function MobileStatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: _Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "go" | "stop" | "signal";
  icon?: LucideIcon;
  href?: string;
}) {
  const toneColor = {
    neutral: "var(--color-ink-950)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  }[tone];

  const body = (
    <>
      <p className="text-m-label mb-1 truncate" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
      <p className="text-m-figure truncate" style={{ color: toneColor }}>
        {value}
      </p>
      {hint && <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>{hint}</p>}
    </>
  );

  const cls = "rounded-[0.5rem] border p-2 text-m-body press overflow-hidden min-w-0";

  if (href) {
    return (
      <Link href={href} className={cls} style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
        {body}
      </Link>
    );
  }
  return (
    <div className={cls} style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
      {body}
    </div>
  );
}

// ─── Mobile section title (warm style — bold text header, not sticky bar) ──

export function MobileSectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2 mt-4">
      <h2 className="text-m-section" style={{ color: "var(--color-ink-950)" }}>
        {children}
      </h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─── Mobile empty state (warm style — matches desktop EmptyState) ──────────
//
// The single canonical mobile empty state.  Feature-parity with the
// desktop `EmptyState` (components/empty-state.tsx): icon plate, title,
// description, hint, primary + secondary action, and a contact-hint
// fallback for roles that can't create the thing.
//
// Uses the warm /m palette tokens (--color-ink-*, --color-concrete).

export function MobileEmptyState({
  icon: Icon,
  title,
  description,
  hint,
  action,
  secondaryAction,
  contactHint,
  size = "default",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** Primary explanatory line below the title. */
  description?: string;
  /** Secondary guidance line — smaller, quieter. */
  hint?: string;
  action?: React.ReactNode;
  /** A quieter alternative next to the primary action. */
  secondaryAction?: React.ReactNode;
  /** Shown when the user's role can't create the thing — replaces the action. */
  contactHint?: string;
  /** `compact` for empty states inside a card or a smaller panel. */
  size?: "default" | "compact";
  className?: string;
}) {
  const compact = size === "compact";
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? "px-4 py-7" : "px-6 py-16"} ${className ?? ""}`}
    >
      {Icon && (
        <div
          className={`grid place-items-center rounded-2xl mb-3 ${compact ? "size-9" : "size-12"}`}
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Icon
            className={compact ? "size-4" : "size-5"}
            style={{ color: "var(--color-ink-300)" }}
          />
        </div>
      )}
      <p
        className={compact ? "text-m-body font-semibold" : "text-m-section font-semibold"}
        style={{ color: "var(--color-ink-950)" }}
      >
        {title}
      </p>
      {description && (
        <p
          className="mt-1.5 max-w-[20rem] text-m-caption leading-relaxed"
          style={{ color: "var(--color-ink-500)" }}
        >
          {description}
        </p>
      )}
      {hint && (
        <p
          className="mt-1 max-w-[20rem] text-m-caption leading-relaxed"
          style={{ color: "var(--color-ink-400)" }}
        >
          {hint}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {secondaryAction}
          {action}
        </div>
      )}
      {!action && contactHint && (
        <p
          className="mt-3 text-m-caption"
          style={{ color: "var(--color-ink-400)" }}
        >
          {contactHint}
        </p>
      )}
    </div>
  );
}

// ─── Mobile no-access (permission denied) ─────────────────────────────────

/**
 * What a role-gated mobile page shows instead of its content.
 *
 * The desktop NoAccess component uses desktop tokens (border-border,
 * bg-card, text-foreground) that don't exist in the mobile warm palette.
 * This is the mobile equivalent — same UX contract (name what's
 * restricted, say who can unlock it, give a way out) but using the
 * --color-ink-* / --color-paper tokens the /m surface uses.
 */
export function MobileNoAccess({
  what = "this page",
  permission,
}: {
  what?: string;
  permission?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center px-4 py-10">
      <div
        className="grid place-items-center w-11 h-11 rounded-full mb-2.5"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Lock className="size-5" style={{ color: "var(--color-ink-300)" }} />
      </div>
      <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>
        {what.charAt(0).toUpperCase() + what.slice(1)} isn&apos;t part of your role
      </p>
      <p className="text-m-caption mt-1.5 max-w-[18rem]" style={{ color: "var(--color-ink-500)" }}>
        Your account doesn&apos;t include access to {what}. An owner or administrator can
        grant it from Setup &rarr; Who Sees What
        {permission ? (
          <>
            {" "}
            (<span className="font-mono text-m-label">{permission}</span>)
          </>
        ) : null}
        .
      </p>
      <Link
        href="/m/home"
        className="mt-3 inline-flex items-center justify-center h-11 px-4 rounded-[0.5rem] text-m-section font-semibold text-m-body press"
        style={{
          backgroundColor: "var(--color-concrete)",
          color: "var(--color-ink-950)",
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}

// ─── Mobile CTA card (warm style — card with gap) ──────────────────────────

export function MobileCta({
  href,
  icon: Icon,
  children,
  variant = "secondary",
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  variant?: "primary" | "signal" | "secondary" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", borderColor: "var(--color-ink-950)" },
    signal: { backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)", borderColor: "var(--color-signal-active)" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)", borderColor: "var(--color-line)" },
    danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-[0.625rem] border-2 p-2.5 text-m-body font-semibold text-m-body press"
      style={styles[variant]}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-m-strong">{children}</span>
      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
    </Link>
  );
}

// ─── Mobile status badge (warm style) ──────────────────────────────────────

/**
 * Maps a StatusMeaning (from the single source of truth in
 * @/components/page) to a v2 BadgeTone. This is the ONLY place mobile
 * v2 status colours are decided — every status flows through
 * statusMeaning() first, so this badge can never disagree with the
 * desktop StatusPill on what a status *means*.
 *
 * Meaning → tone:
 *   neutral  → neutral  (grey — not started / inactive)
 *   active   → signal   (amber — in flight, someone is working on it)
 *   waiting  → steel    (blue-grey — blocked on a human decision)
 *   good     → go       (green — finished successfully)
 *   bad      → stop     (red — cancelled / rejected / failed)
 *   alert    → stop     (red — needs attention now)
 */
const MEANING_TO_TONE: Record<string, BadgeTone> = {
  neutral: "neutral",
  active: "signal",
  waiting: "steel",
  good: "go",
  bad: "stop",
  alert: "stop",
};

/** Title-case a status enum value: "IN_TRANSIT" → "In Transit". */
function titleCaseStatus(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function MobileStatusBadge({ status, label }: { status: string; label?: string }) {
  const meaning = statusMeaning(status);
  const tone = MEANING_TO_TONE[meaning] ?? "neutral";
  return <Badge tone={tone}>{label ?? titleCaseStatus(status)}</Badge>;
}

/**
 * The raw v2 CSS colour for a status's meaning — for dots, progress
 * rings, left-border accents and background tints where a Badge would
 * be too heavy. Draws from the SAME statusMeaning() map as
 * MobileStatusBadge and the desktop StatusPill, so a dot here can
 * never disagree with a pill there.
 *
 * Pass `wash: true` for the light background variant (e.g. for chip
 * backgrounds); pass `dark: true` for the text-on-light variant.
 */
const MEANING_TO_COLOR: Record<string, { base: string; wash: string; dark: string }> = {
  neutral: { base: "var(--color-ink-400)", wash: "var(--color-concrete)", dark: "var(--color-ink-700)" },
  active: { base: "var(--color-signal)", wash: "var(--color-signal-wash)", dark: "var(--color-signal-dark)" },
  waiting: { base: "var(--color-steel)", wash: "var(--color-steel-wash)", dark: "var(--color-steel)" },
  good: { base: "var(--color-go)", wash: "var(--color-go-wash)", dark: "var(--color-go)" },
  bad: { base: "var(--color-stop)", wash: "var(--color-stop-wash)", dark: "var(--color-stop)" },
  alert: { base: "var(--color-stop)", wash: "var(--color-stop-wash)", dark: "var(--color-stop)" },
};

export function mobileStatusColor(status: string, variant: "base" | "wash" | "dark" = "base"): string {
  const meaning = statusMeaning(status);
  const entry = MEANING_TO_COLOR[meaning] ?? MEANING_TO_COLOR.neutral;
  if (!entry) return "var(--color-ink-400)";
  return entry[variant] ?? "var(--color-ink-400)";
}

// ─── Mobile page header ────────────────────────────────────────────────────

/**
 * Page-level header for mobile list/index pages. Title + optional subtitle
 * on the left, an optional action slot on the right, and an optional stats
 * band below. This is the server-component version (no client hooks).
 */
export function MobilePageHeader({
  title,
  subtitle,
  right,
  stats,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  stats?: { label: string; value: string; tone?: "default" | "warning" | "danger" | "success" }[];
}) {
  return (
    <div
      className="border-b"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1
            className="truncate text-m-section font-bold leading-tight tracking-[-0.02em]"
            style={{ color: "var(--color-ink-950)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-m-caption leading-snug" style={{ color: "var(--color-ink-500)" }}>{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl
          className="flex items-stretch border-t"
          style={{ borderColor: "var(--color-line)" }}
        >
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="min-w-0 flex-1 px-4 py-2.5"
              style={i > 0 ? { borderLeft: "1px solid var(--color-line)" } : undefined}
            >
              <dt className="truncate text-m-caption" style={{ color: "var(--color-ink-500)" }}>{s.label}</dt>
              <dd
                className="mt-1 truncate text-m-section font-semibold leading-none tnum"
                style={{
                  color:
                    s.tone === "warning" ? "var(--color-warn)" :
                    s.tone === "danger" ? "var(--color-stop)" :
                    s.tone === "success" ? "var(--color-go)" :
                    "var(--color-ink-950)",
                }}
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

// ─── Mobile pipeline stepper (warm palette) ───────────────────────────────

/**
 * Mobile version of the desktop PipelineStepper. Same concept — a
 * compact "you are here" strip — but using the warm --color-ink-*
 * tokens and inline styles that the /m surface uses.
 *
 * Dots are 14px (slightly smaller than desktop's 16px to fit mobile
 * density), labels are text-m-caption, connectors are 12px wide.
 */
export type MobilePipelineStep = {
  label: string;
  state: "done" | "current" | "pending" | "skipped";
  href?: string;
};

export function MobilePipelineStepper({
  steps,
}: {
  steps: MobilePipelineStep[];
}) {
  if (steps.length === 0) return null;

  return (
    <nav aria-label="Pipeline position" className="flex items-center">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const lineDone = step.state === "done";

        const dotColor =
          step.state === "done" ? "var(--color-ink-900)" :
          step.state === "current" ? "var(--color-signal)" :
          "transparent";

        const borderColor =
          step.state === "done" ? "var(--color-ink-900)" :
          step.state === "current" ? "var(--color-signal)" :
          step.state === "skipped" ? "var(--color-line)" :
          "var(--color-ink-300)";

        const labelColor =
          step.state === "current" ? "var(--color-ink-950)" :
          step.state === "done" ? "var(--color-ink-700)" :
          "var(--color-ink-400)";

        const dot = (
          <span
            className="flex shrink-0 items-center justify-center rounded-full border"
            style={{
              width: 14, height: 14, borderColor,
              backgroundColor: dotColor,
              borderStyle: step.state === "skipped" ? "dashed" : "solid",
              borderWidth: 1.5,
            }}
          >
            {step.state === "done" && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-paper)" }} />
            )}
            {step.state === "current" && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-ink-950)" }} />
            )}
          </span>
        );

        const content = (
          <>
            {dot}
            <span
              className="whitespace-nowrap font-medium ml-1"
              style={{ fontSize: "0.5625rem", color: labelColor }}
            >
              {step.label}
            </span>
          </>
        );

        return (
          <div key={i} className="flex items-center">
            {step.href && step.state !== "pending" ? (
              <a href={step.href} className="flex items-center text-m-body press">
                {content}
              </a>
            ) : (
              <div className="flex items-center">{content}</div>
            )}
            {!isLast && (
              <span
                className="mx-1 h-px shrink-0"
                style={{
                  width: 12,
                  backgroundColor: lineDone ? "var(--color-ink-700)" : "var(--color-line)",
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
