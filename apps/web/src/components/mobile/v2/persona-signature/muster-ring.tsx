"use client";

import * as React from "react";
import Link from "next/link";
import { Users, CalendarCheck, MapPin } from "lucide-react";
import { SignatureShell, SignatureNote, toneColor, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   MUSTER RING — the HR persona's signature component

   HR's first question every morning is not a list, a funnel or a
   timeline: it is "who is actually here today, out of everyone I employ?"
   That is a PART-OF-WHOLE question, and the honest shape for part-of-whole
   is a ring.

   The segment that matters most is the one most dashboards hide: UNMARKED.
   An employee with no attendance row today is NOT absent — nobody has
   checked. Folding those into "present" flatters the number and folding
   them into "absent" slanders the worker. They get their own grey arc, so
   the ring shows data quality and headcount in the same glance, and the
   gap in the ring is literally the gap in the register.

   Beneath it, the same total broken out per site, because the follow-up
   question is always "where is the hole?"
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MusterSite {
  id: string;
  name: string;
  present: number;
  absent: number;
  leave: number;
}

export interface MusterData {
  headcount: {
    totalActive: number;
    present: number;
    half: number;
    leave: number;
    absent: number;
    unmarked: number;
  } | null;
  sites: MusterSite[];
  pending: { leaves: number } | null;
}

interface Segment {
  key: string;
  label: string;
  value: number;
  tone: Tone;
}

export function MusterRing({ data }: { data: MusterData }) {
  const { headcount, sites, pending } = data;

  if (!headcount || headcount.totalActive === 0) {
    return (
      <SignatureShell eyebrow="Muster" icon={Users}>
        <SignatureNote>No active employees on the roll.</SignatureNote>
      </SignatureShell>
    );
  }

  const { totalActive, present, half, leave, absent, unmarked } = headcount;
  const onSite = present + half;

  const segments: Segment[] = (
    [
      { key: "present", label: "On site", value: onSite, tone: "go" },
      { key: "leave", label: "Leave", value: leave, tone: "steel" },
      { key: "absent", label: "Absent", value: absent, tone: "bad" },
      { key: "unmarked", label: "Unmarked", value: unmarked, tone: "neutral" },
    ] satisfies Segment[]
  ).filter((s) => s.value > 0);

  const pct = totalActive > 0 ? Math.round((onSite / totalActive) * 100) : 0;

  return (
    <SignatureShell
      eyebrow="Muster · today"
      icon={Users}
      hero={`${pct}%`}
      heroLabel="on site"
      tone={pct >= 80 ? "go" : pct >= 50 ? "warn" : "bad"}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Ring segments={segments} total={totalActive} center={onSite} />

        {/* Legend — doubles as the numeric readout, so the ring never
            needs a tooltip to be useful. */}
        <ul className="min-w-0 flex-1 space-y-0.5">
          {segments.map((s, i) => (
            <li
              key={s.key}
              className="sig-row flex items-center gap-1.5"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    s.tone === "neutral" ? "var(--color-ink-300)" : toneColor(s.tone),
                }}
              />
              <span
                className="text-m-caption flex-1 min-w-0 truncate"
                style={{ color: "var(--color-ink-600)" }}
              >
                {s.label}
              </span>
              <span
                className="text-m-caption font-bold tabular-nums"
                style={{ color: "var(--color-ink-950)" }}
              >
                {s.value}
              </span>
            </li>
          ))}
          <li
            className="flex items-center gap-1.5 pt-0.5"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            <span className="text-m-caption flex-1" style={{ color: "var(--color-ink-400)" }}>
              On roll
            </span>
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: "var(--color-ink-500)" }}
            >
              {totalActive}
            </span>
          </li>
        </ul>
      </div>

      {/* ── Per site ── */}
      {sites.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-line)" }}>
          {sites.slice(0, 5).map((s, i) => (
            <Link
              key={s.id}
              href={`/m/attendance?projectId=${s.id}`}
              className="sig-row press flex items-center gap-2 px-3 py-1.5"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <MapPin className="size-3 shrink-0" style={{ color: "var(--color-ink-400)" }} />
              <span
                className="text-m-body font-semibold truncate flex-1 min-w-0"
                style={{ color: "var(--color-ink-950)" }}
              >
                {s.name}
              </span>
              <span
                className="text-m-caption font-bold tabular-nums shrink-0"
                style={{ color: "var(--color-go)" }}
              >
                {s.present}
              </span>
              {s.absent > 0 && (
                <span
                  className="text-m-micro tabular-nums shrink-0"
                  style={{ color: "var(--color-danger)" }}
                >
                  −{s.absent}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ── Waiting on HR ── */}
      {pending && pending.leaves > 0 && (
        <Link
          href="/m/hr/leaves"
          className="sig-row press flex items-center gap-1.5 px-3 py-1.5"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          <CalendarCheck className="size-3 shrink-0" style={{ color: "var(--color-signal)" }} />
          <span className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
            <span className="font-bold tabular-nums">{pending.leaves}</span> leave{" "}
            {pending.leaves === 1 ? "request" : "requests"} pending
          </span>
        </Link>
      )}
    </SignatureShell>
  );
}

/* ── The ring ────────────────────────────────────────────────────────────
   Plain SVG arcs. Each segment is a circle with a dash pattern; the whole
   ring sweeps in by transitioning stroke-dashoffset, which is GPU-cheap
   and interruptible (a keyframe would restart from zero on re-render). */

const SIZE = 58;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function Ring({
  segments,
  total,
  center,
}: {
  segments: Segment[];
  total: number;
  center: number;
}) {
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 40);
    return () => clearTimeout(t);
  }, []);

  // Cumulative sweep: each arc starts where the previous one ended. Built
  // with a plain loop rather than a mutating `map` callback so the React
  // compiler can prove nothing escapes the render.
  const arcs: { key: string; color: string; dash: string; rotation: number }[] = [];
  let offset = 0;
  for (const s of segments) {
    const len = (total > 0 ? s.value / total : 0) * C;
    // A 1.5px gap between segments keeps adjacent arcs legible without a
    // stroke outline, which would muddy the colours at this size.
    const visible = Math.max(0, len - 1.5);
    arcs.push({
      key: s.key,
      color: s.tone === "neutral" ? "var(--color-ink-300)" : toneColor(s.tone),
      dash: `${visible} ${C - visible}`,
      rotation: (offset / C) * 360,
    });
    offset += len;
  }

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="block" aria-hidden>
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--color-concrete)"
          strokeWidth={STROKE}
        />
        {arcs.map((a, i) => (
          <circle
            key={a.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={a.dash}
            strokeDashoffset={drawn ? 0 : C}
            // -90deg puts the first segment at 12 o'clock, where a reader
            // expects a ring to start.
            transform={`rotate(${a.rotation - 90} ${SIZE / 2} ${SIZE / 2})`}
            style={{
              transition: `stroke-dashoffset 560ms var(--ease-out) ${i * 60}ms`,
            }}
          />
        ))}
      </svg>
      {/* Centre — the headcount that matters, not a percentage repeat */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-m-title tabular-nums leading-none"
          style={{ color: "var(--color-ink-950)" }}
        >
          {center}
        </span>
        <span
          className="text-m-micro leading-none mt-0.5"
          style={{ color: "var(--color-ink-400)" }}
        >
          here
        </span>
      </div>
    </div>
  );
}
