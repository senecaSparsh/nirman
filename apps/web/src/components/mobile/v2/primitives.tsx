import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

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
  primary: { backgroundColor: "var(--color-ink-950)", color: "#fff", borderColor: "var(--color-ink-950)" },
  signal: { backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)", borderColor: "#e09a10", fontWeight: 700 },
  secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)", borderColor: "var(--color-line)" },
  ghost: { backgroundColor: "transparent", color: "var(--color-ink-700)", borderColor: "transparent" },
  danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-[0.75rem]",
  lg: "h-11 px-5 text-[0.875rem]",
  xl: "h-14 px-6 text-[1.0625rem] font-bold",
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
        "text-[0.5625rem] font-semibold uppercase tracking-wide",
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
      <dt className="text-[0.5625rem] uppercase tracking-wide font-semibold" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </dt>
      <dd className="text-[1.0625rem] font-bold tabular-nums" style={{ color: toneColor }}>
        {value}
      </dd>
      {hint ? (
        <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>{hint}</p>
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
      <h2 className="text-[0.8125rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
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
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-sm px-4 pt-2.5 pb-safe"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)", borderColor: "var(--color-line)" }}
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
}: {
  href?: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  metaSub?: string;
  badge?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
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
        <p className="truncate text-[0.75rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {badge}
      {meta && (
        <div className="shrink-0 text-right">
          <p className="text-[0.75rem] font-bold tabular-nums leading-tight" style={{ color: toneColor }}>
            {meta}
          </p>
          {metaSub && (
            <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-300)" }}>
              {metaSub}
            </p>
          )}
        </div>
      )}
      {href && <ChevronRight className="shrink-0 size-3.5" style={{ color: "var(--color-ink-300)" }} />}
    </>
  );

  const cls = "flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press";

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
  icon: Icon,
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
      <p className="text-[0.5rem] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </p>
      <p className="text-[0.9375rem] font-bold tabular-nums leading-none" style={{ color: toneColor }}>
        {value}
      </p>
      {hint && <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>{hint}</p>}
    </>
  );

  const cls = "rounded-[0.625rem] border p-2.5 press";

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
      <h2 className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
        {children}
      </h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─── Mobile empty state (warm style — matches Nirman OS EmptyState) ────────

export function MobileEmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-4 py-7">
      <div className="grid place-items-center w-11 h-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
        <Icon className="size-5" style={{ color: "var(--color-ink-300)" }} />
      </div>
      <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
      {hint && <p className="text-[0.625rem] mt-1 max-w-[16rem]" style={{ color: "var(--color-ink-500)" }}>{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
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
    primary: { backgroundColor: "var(--color-ink-950)", color: "#fff", borderColor: "var(--color-ink-950)" },
    signal: { backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)", borderColor: "#e09a10" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)", borderColor: "var(--color-line)" },
    danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-[0.625rem] border-2 p-2.5 font-semibold press"
      style={styles[variant]}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-[0.75rem]">{children}</span>
      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
    </Link>
  );
}

// ─── Mobile status badge (warm style) ──────────────────────────────────────

export function MobileStatusBadge({ status, label }: { status: string; label?: string }) {
  const toneMap: Record<string, BadgeTone> = {
    DRAFT: "neutral",
    PENDING: "neutral",
    SUBMITTED: "signal",
    APPROVED: "go",
    ORDERED: "go",
    ACTIVE: "go",
    COMPLETED: "go",
    DELIVERED: "go",
    PARTIAL: "signal",
    RECEIVED: "go",
    PROCESSED: "go",
    CANCELLED: "stop",
    REJECTED: "stop",
    FAILED: "stop",
    OVERDUE: "stop",
    SYNCED: "go",
    PENDING_SYNC: "signal",
    // Legal doc statuses
    NOT_REQUIRED: "neutral",
    EXPIRED: "stop",
    RENEWAL_DUE: "signal",
  };
  const tone = toneMap[status] ?? "neutral";
  return <Badge tone={tone}>{label ?? status}</Badge>;
}
