"use client";

import * as React from "react";
import Link from "next/link";
import { Filter, PhoneCall, Flame, TrendingUp } from "lucide-react";
import { SignatureShell, SignatureNote, money, toneColor, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   DEAL FUNNEL — the sales persona's signature component

   Sales thinks in two dimensions at once: how many deals are at each
   stage, and what they are worth. A count-only pipeline is misleading —
   twelve ₹5L enquiries are not two ₹3Cr negotiations — so this component
   never shows a count without its money next to it.

   The shape is a literal funnel: bars centred and tapering down the
   stages. Width is COUNT (volume entering), and the money rides as the
   label. Where the taper is abrupt, that is the leak — and because the
   bars are centred, a bad drop-off reads as an asymmetric pinch rather
   than just "a shorter bar", which is far easier to spot at a glance.

   Below it: the follow-ups that are actually overdue. A pipeline you can
   look at is a report; a pipeline with today's calls attached is a tool.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  value: number;
}

export interface FunnelFollowUp {
  id: string;
  name: string;
  phone: string;
  stage: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
}

export interface FunnelData {
  stages: FunnelStage[];
  lost: number;
  followUps: FunnelFollowUp[];
  won: { count: number; value: number } | null;
}

/** Stage → colour, keyed by id so the mapping can't drift if the
    ordered list ever changes. Warmer as a deal gets closer to money. */
const STAGE_TONE: Record<string, Tone> = {
  NEW: "steel",
  CONTACTED: "steel",
  SITE_VISIT: "warn",
  NEGOTIATION: "warn",
  BOOKED: "go",
};

export function DealFunnel({ data }: { data: FunnelData }) {
  const { stages, followUps, won, lost } = data;

  const openStages = stages.filter((s) => s.id !== "BOOKED");
  const pipelineValue = openStages.reduce((s, x) => s + x.value, 0);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const totalLeads = stages.reduce((s, x) => s + x.count, 0);

  if (totalLeads === 0 && !won?.count) {
    return (
      <SignatureShell eyebrow="Deal funnel" icon={Filter}>
        <SignatureNote>No leads in the pipeline yet.</SignatureNote>
      </SignatureShell>
    );
  }

  return (
    <SignatureShell
      eyebrow="Deal funnel"
      icon={Filter}
      hero={money(pipelineValue)}
      heroLabel="open"
      tone="neutral"
    >
      {/* ── The funnel ── */}
      <div className="px-3 py-2.5 space-y-1">
        {stages.map((s, i) => (
          <FunnelBar
            key={s.id}
            stage={s}
            widthPct={Math.max(14, (s.count / maxCount) * 100)}
            tone={STAGE_TONE[s.id] ?? "steel"}
            index={i}
          />
        ))}
      </div>

      {/* ── Won this month + leakage ──
          Booked deals and lost deals are the funnel's two exits, so they
          share one line: what came out the bottom, what fell out the side. */}
      {((won?.count ?? 0) > 0 || lost > 0) && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          <span className="inline-flex items-center gap-1 min-w-0">
            <TrendingUp className="size-3 shrink-0" style={{ color: "var(--color-go)" }} />
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: "var(--color-go)" }}
            >
              {won?.count ?? 0}
            </span>
            <span className="text-m-micro truncate" style={{ color: "var(--color-ink-500)" }}>
              won this month · {money(won?.value ?? 0)}
            </span>
          </span>
          {lost > 0 && (
            <span
              className="text-m-micro tabular-nums shrink-0"
              style={{ color: "var(--color-ink-400)" }}
            >
              {lost} lost
            </span>
          )}
        </div>
      )}

      {/* ── Today's calls ── */}
      {followUps.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-line)" }}>
          <p
            className="px-3 pt-1.5 pb-1 text-m-micro font-bold uppercase tracking-[0.08em]"
            style={{ color: "var(--color-ink-400)" }}
          >
            Follow-ups due
          </p>
          {followUps.map((f, i) => (
            <FollowUpRow key={f.id} lead={f} index={i} />
          ))}
        </div>
      )}
    </SignatureShell>
  );
}

/* ── One funnel stage ────────────────────────────────────────────────── */

function FunnelBar({
  stage,
  widthPct,
  tone,
  index,
}: {
  stage: FunnelStage;
  widthPct: number;
  tone: Tone;
  index: number;
}) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setGrown(true), 20 + index * 40);
    return () => clearTimeout(t);
  }, [index]);

  const color = toneColor(tone);
  const empty = stage.count === 0;

  return (
    <Link
      href={`/m/leads?stage=${stage.id}`}
      className="press block group"
      aria-label={`${stage.label}: ${stage.count} leads`}
    >
      <div className="flex items-center gap-2">
        {/* Label rail — fixed width so the bars stay optically centred
            against a common axis instead of drifting with label length. */}
        <span
          className="text-m-caption font-semibold w-[4.25rem] shrink-0 truncate"
          style={{ color: empty ? "var(--color-ink-300)" : "var(--color-ink-700)" }}
        >
          {stage.label}
        </span>

        {/* Bar — centred, so the taper is visible as a pinch on both sides */}
        <span className="relative flex-1 min-w-0 h-5 grid place-items-center">
          <span
            className="block h-5 rounded-[0.25rem]"
            style={{
              width: grown ? `${widthPct}%` : "8%",
              backgroundColor: empty
                ? "var(--color-concrete)"
                : `color-mix(in srgb, ${color} 22%, var(--color-paper))`,
              border: `1px solid ${empty ? "var(--color-line)" : `color-mix(in srgb, ${color} 45%, transparent)`}`,
              transition: "width 560ms var(--ease-out)",
            }}
          />
          {/* Count sits ON the bar, money to its right — one glance gets
              both without a legend. */}
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: empty ? "var(--color-ink-300)" : color }}
            >
              {stage.count}
            </span>
            {stage.value > 0 && (
              <span
                className="text-m-micro tabular-nums"
                style={{ color: "var(--color-ink-500)" }}
              >
                {money(stage.value)}
              </span>
            )}
          </span>
        </span>
      </div>
    </Link>
  );
}

/* ── One overdue follow-up ───────────────────────────────────────────── */

function FollowUpRow({ lead, index }: { lead: FunnelFollowUp; index: number }) {
  const hot = lead.priority === "HOT" || lead.priority === "HIGH";
  return (
    <div
      className="sig-row flex items-center gap-2 px-3 py-1.5"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Link href={`/m/leads/${lead.id}`} className="press flex items-center gap-1.5 min-w-0 flex-1">
        {hot && (
          <Flame className="size-3 shrink-0" style={{ color: "var(--color-danger)" }} />
        )}
        <span className="min-w-0">
          <span
            className="block text-m-body font-semibold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {lead.name}
          </span>
          <span
            className="block text-m-caption truncate"
            style={{
              color: lead.overdue ? "var(--color-danger)" : "var(--color-ink-500)",
            }}
          >
            {lead.overdue ? "Overdue" : "Due today"} ·{" "}
            {lead.stage.toLowerCase().replace(/_/g, " ")}
          </span>
        </span>
      </Link>
      {/* The action is the point of the row — a lead you should have called
          deserves a one-tap call, not a page you then hunt a number on. */}
      <a
        href={`tel:${lead.phone}`}
        aria-label={`Call ${lead.name}`}
        className="press grid place-items-center size-7 rounded-full shrink-0"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-go) 14%, var(--color-paper))",
          border: "1px solid color-mix(in srgb, var(--color-go) 40%, transparent)",
        }}
      >
        <PhoneCall className="size-3" style={{ color: "var(--color-go)" }} />
      </a>
    </div>
  );
}
