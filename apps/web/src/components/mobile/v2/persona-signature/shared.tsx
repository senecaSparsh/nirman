"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONA SIGNATURE — shared grammar

   Six components, one family. The executive's OrbitNavigator works because
   an owner thinks in HIERARCHY (company → project → unit). No other role
   does, so cloning the ring for everyone would be decoration, not design.
   Instead each persona gets a component whose organising axis matches how
   that role actually reasons:

     field       → time            (Shift Rail)
     ops         → comparison      (Project Pulse)
     procurement → stage flow      (Pipeline Flow)
     sales       → funnel + money  (Deal Funnel)
     finance     → money over time (Cash Position)
     hr          → people present  (Muster Ring)

   What holds them together is this grammar, not a shared shape:

     1. EYEBROW   — uppercase micro label, the component's name
     2. HERO      — one number that answers "how is it going?" at a glance
     3. FIGURE    — the distinctive visualisation
     4. DRILL     — tappable rows into the real pages

   Motion follows the repo's design skills: transform/opacity only, custom
   ease-out curves, 30-60ms stagger, never scale(0), and `prefers-reduced-
   motion` is handled globally in globals.css.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Frame ───────────────────────────────────────────────────────────── */

export function SignatureShell({
  eyebrow,
  icon: Icon,
  hero,
  heroLabel,
  tone = "neutral",
  children,
}: {
  eyebrow: string;
  icon: LucideIcon;
  hero?: React.ReactNode;
  heroLabel?: string;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <section
      className="sig-in rounded-[0.75rem] border overflow-hidden"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        boxShadow: "var(--shadow-raised)",
      }}
    >
      {/* Header — eyebrow left, hero figure right. The hero is the only
          large number in the component; everything else stays quiet so
          the glance lands in one place. */}
      <header
        className="flex items-end justify-between gap-3 px-3 pt-2.5 pb-2"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="size-3 shrink-0" style={{ color: "var(--color-ink-400)" }} />
          <span
            className="text-m-micro font-bold uppercase tracking-[0.08em] truncate"
            style={{ color: "var(--color-ink-500)" }}
          >
            {eyebrow}
          </span>
        </div>
        {hero != null && (
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span
              className="text-[1.0625rem] font-bold leading-none tabular-nums tracking-[-0.02em]"
              style={{ color: toneColor(tone) }}
            >
              {hero}
            </span>
            {heroLabel && (
              <span className="text-m-micro" style={{ color: "var(--color-ink-400)" }}>
                {heroLabel}
              </span>
            )}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/* ── Tone ────────────────────────────────────────────────────────────── */

export type Tone = "neutral" | "go" | "warn" | "bad" | "steel";

export function toneColor(tone: Tone): string {
  switch (tone) {
    case "go":
      return "var(--color-go)";
    case "warn":
      return "var(--color-signal)";
    case "bad":
      return "var(--color-danger)";
    case "steel":
      return "var(--color-steel)";
    default:
      return "var(--color-ink-950)";
  }
}

/* ── Drill row ───────────────────────────────────────────────────────────
   The shared "tap into the real page" affordance. Every signature
   component ends in these so the dashboard is a way IN, never a dead end
   (Apple §16 wayfinding: never trap the user). */

export function DrillRow({
  href,
  icon: Icon,
  title,
  sub,
  right,
  tone = "neutral",
  index = 0,
}: {
  href: string;
  icon?: LucideIcon;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  tone?: Tone;
  index?: number;
}) {
  return (
    <Link
      href={href}
      className="sig-row press flex items-center gap-2 px-3 py-1.5"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {Icon && (
        <Icon className="size-3 shrink-0" style={{ color: toneColor(tone) }} />
      )}
      <div className="min-w-0 flex-1">
        <p
          className="text-m-body font-semibold truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {title}
        </p>
        {sub && (
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {sub}
          </p>
        )}
      </div>
      {right}
      <ChevronRight
        className="size-3 shrink-0"
        style={{ color: "var(--color-ink-300)" }}
      />
    </Link>
  );
}

/* ── Proportional bar ────────────────────────────────────────────────────
   Width animates from 0 via a CSS custom property set on mount, so the
   growth is a transition (interruptible) rather than a keyframe. */

export function Bar({
  pct,
  tone = "neutral",
  track = true,
  height = 4,
  delay = 0,
}: {
  pct: number;
  tone?: Tone;
  track?: boolean;
  height?: number;
  delay?: number;
}) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setGrown(true), 20 + delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        height,
        backgroundColor: track ? "var(--color-concrete)" : "transparent",
      }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: grown ? `${Math.max(0, Math.min(100, pct))}%` : "0%",
          backgroundColor: toneColor(tone),
          transition: "width 520ms var(--ease-out)",
        }}
      />
    </div>
  );
}

/* ── Stat cell ───────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-m-body font-bold tabular-nums leading-tight"
        style={{ color: toneColor(tone) }}
      >
        {value}
      </p>
      <p className="text-m-micro truncate" style={{ color: "var(--color-ink-400)" }}>
        {label}
      </p>
    </div>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */

export function SignatureSkeleton() {
  return (
    <div
      className="rounded-[0.75rem] border overflow-hidden"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        className="h-8"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      />
      <div className="p-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-6 rounded-[0.375rem] animate-pulse"
            style={{ backgroundColor: "var(--color-concrete)" }}
          />
        ))}
      </div>
    </div>
  );
}

export function SignatureNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-3 py-3 text-m-caption text-center"
      style={{ color: "var(--color-ink-400)" }}
    >
      {children}
    </p>
  );
}

/* ── Formatting ──────────────────────────────────────────────────────────
   Money on a phone is read at a glance, not audited — compact Indian
   notation (L/Cr) beats full digits at this size. */

export function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs / 1e7 >= 10 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs / 1e5 >= 10 ? 0 : 1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/** "14:05" from an ISO string, in the viewer's local zone. */
export function clock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ageLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const m = Math.floor(days / 30);
  return `${m}mo`;
}
