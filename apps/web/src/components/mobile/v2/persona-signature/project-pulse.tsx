"use client";

import * as React from "react";
import Link from "next/link";
import { HardHat, Users, ClipboardList, Inbox, AlertTriangle } from "lucide-react";
import { SignatureShell, SignatureNote, money, toneColor, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECT PULSE — the ops persona's signature component

   A project manager does not ask "what is there?" (hierarchy) or "what is
   next?" (time). They ask "which of my sites is in trouble?" — a
   COMPARISON across a small set. So the component is small multiples: one
   identical card per project, sorted by risk, scannable as a column.

   The load-bearing idea is the burn bar. One track carries two facts:

     ▸ the FILL is budget consumed
     ▸ the TICK is where the schedule says you should be

   Fill past tick = spending faster than time is passing. That is the one
   judgement a PM makes about a project every single day, and here it needs
   no numbers and no reading — just "is the bar past the notch".

   Sorting by risk means the card that needs attention is always the first
   one, so the component degrades gracefully: glance at row one and stop.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PulseProject {
  id: string;
  name: string;
  status: string;
  budget: number;
  spent: number;
  burn: number | null;
  schedule: number | null;
  dprBacklog: number;
  reqBacklog: number;
  crew: number;
  risk: number;
  flag: "ok" | "watch" | "over";
}

export interface PulseData {
  projects: PulseProject[];
  totals: {
    budget: number;
    spent: number;
    crew: number;
    atRisk: number;
  } | null;
}

const FLAG_TONE: Record<PulseProject["flag"], Tone> = {
  ok: "go",
  watch: "warn",
  over: "bad",
};

export function ProjectPulse({ data }: { data: PulseData }) {
  const { projects, totals } = data;

  if (projects.length === 0) {
    return (
      <SignatureShell eyebrow="Project pulse" icon={HardHat}>
        <SignatureNote>No active projects to track.</SignatureNote>
      </SignatureShell>
    );
  }

  const atRisk = totals?.atRisk ?? 0;

  return (
    <SignatureShell
      eyebrow="Project pulse"
      icon={HardHat}
      hero={atRisk > 0 ? String(atRisk) : "All"}
      heroLabel={atRisk > 0 ? "at risk" : "on track"}
      tone={atRisk > 0 ? "bad" : "go"}
    >
      {/* Portfolio strip — the sum, so the cards below read as parts of a
          whole rather than a disconnected list. */}
      {totals && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5"
          style={{
            backgroundColor: "var(--color-paper-2)",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          <MiniStat label="Budget" value={money(totals.budget)} />
          <MiniStat
            label="Spent"
            value={money(totals.spent)}
            tone={totals.spent > totals.budget && totals.budget > 0 ? "bad" : "neutral"}
          />
          <MiniStat label="On site" value={String(totals.crew)} tone="steel" />
        </div>
      )}

      <div>
        {projects.map((p, i) => (
          <PulseCard key={p.id} project={p} index={i} />
        ))}
      </div>
    </SignatureShell>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
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
      <p className="text-m-micro" style={{ color: "var(--color-ink-400)" }}>
        {label}
      </p>
    </div>
  );
}

/* ── One project ─────────────────────────────────────────────────────── */

function PulseCard({ project: p, index }: { project: PulseProject; index: number }) {
  const tone = FLAG_TONE[p.flag];
  const burn = p.burn ?? 0;
  const hasBudget = p.burn != null;

  return (
    <Link
      href={`/m/projects/${p.id}`}
      className="sig-row press block px-3 py-2"
      style={{
        animationDelay: `${Math.min(index, 8) * 40}ms`,
        borderBottom: "1px solid var(--color-line)",
      }}
    >
      {/* Title line */}
      <div className="flex items-center gap-1.5 mb-1">
        {p.flag !== "ok" && (
          <AlertTriangle
            className="size-3 shrink-0"
            style={{ color: toneColor(tone) }}
          />
        )}
        <p
          className="text-m-body font-semibold truncate flex-1 min-w-0"
          style={{ color: "var(--color-ink-950)" }}
        >
          {p.name}
        </p>
        <span
          className="text-m-caption font-bold tabular-nums shrink-0"
          style={{ color: toneColor(hasBudget ? tone : "neutral") }}
        >
          {hasBudget ? `${burn}%` : money(p.spent)}
        </span>
      </div>

      {/* Burn track — fill = money spent, notch = where time says we are. */}
      <BurnTrack burn={p.burn} schedule={p.schedule} tone={tone} delay={index * 40} />

      {/* Signals — only rendered when non-zero, so a healthy project is a
          quiet two-line card and a troubled one visibly carries more. */}
      <div className="flex items-center gap-2.5 mt-1">
        <Signal icon={Users} value={p.crew} label="on site" tone="steel" muted={p.crew === 0} />
        {p.dprBacklog > 0 && (
          <Signal icon={ClipboardList} value={p.dprBacklog} label="DPR" tone="warn" />
        )}
        {p.reqBacklog > 0 && (
          <Signal icon={Inbox} value={p.reqBacklog} label="req" tone="warn" />
        )}
        <span className="flex-1" />
        {hasBudget && (
          <span className="text-m-micro tabular-nums" style={{ color: "var(--color-ink-400)" }}>
            {money(p.spent)} / {money(p.budget)}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * The burn track. Fill grows on mount via a width transition (not a
 * keyframe, so it stays interruptible and retargetable). The schedule
 * notch is a 2px marker — deliberately a different shape from the fill so
 * the two facts never read as one bar.
 */
function BurnTrack({
  burn,
  schedule,
  tone,
  delay,
}: {
  burn: number | null;
  schedule: number | null;
  tone: Tone;
  delay: number;
}) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setGrown(true), 20 + delay);
    return () => clearTimeout(t);
  }, [delay]);

  // Overruns are clamped for the FILL but still reported as a number
  // above, so a 140% project doesn't silently look identical to 100%.
  const fill = Math.max(0, Math.min(100, burn ?? 0));

  return (
    <div
      className="relative w-full rounded-full"
      style={{ height: 5, backgroundColor: "var(--color-concrete)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: grown ? `${fill}%` : "0%",
          backgroundColor: toneColor(burn == null ? "steel" : tone),
          transition: "width 520ms var(--ease-out)",
        }}
      />
      {schedule != null && (
        <span
          className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded-full"
          style={{
            left: `calc(${Math.max(0, Math.min(100, schedule))}% - 1px)`,
            backgroundColor: "var(--color-ink-950)",
            opacity: 0.55,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

function Signal({
  icon: Icon,
  value,
  label,
  tone,
  muted = false,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  tone: Tone;
  muted?: boolean;
}) {
  const color = muted ? "var(--color-ink-300)" : toneColor(tone);
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="size-2.5" style={{ color }} />
      <span className="text-m-micro font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-m-micro" style={{ color: "var(--color-ink-400)" }}>
        {label}
      </span>
    </span>
  );
}
