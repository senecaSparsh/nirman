"use client";

import * as React from "react";
import Link from "next/link";
import { Scale, ArrowDownLeft, ArrowUpRight, Clock3 } from "lucide-react";
import { SignatureShell, SignatureNote, money, toneColor, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   CASH POSITION — the finance persona's signature component

   Finance reasons about direction and timing of money, so the component
   has exactly those two parts:

   1. THE BEAM. One horizontal axis with a fixed centre. Money received
      pushes right, money paid pushes left, both scaled against the same
      maximum. Because they share a scale and an origin, "are we net
      positive this month" is answered by which side is longer — no
      subtraction, no reading. Two separate bars could not do this; a
      shared axis is the whole idea.

   2. THE LADDER. Payables bucketed 0/30/60/90 by due date. Aging is the
      question finance actually gets asked ("what's overdue?"), and a
      ladder makes the weight sitting in the late buckets obvious.

   Colour is used strictly: green is money in, red is money out or late.
   It never decorates.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CashBucket {
  id: string;
  label: string;
  amount: number;
  count: number;
}

export interface CashData {
  inflow: number;
  outflow: number;
  net: number;
  breakdown: {
    sales: number;
    rent: number;
    expenses: number;
    suppliers: number;
  };
  aging: CashBucket[];
  payableTotal: number;
  pending: { expenses: number } | null;
}

const BUCKET_TONE: Record<string, Tone> = {
  due: "steel",
  d30: "warn",
  d60: "warn",
  d90: "bad",
};

export function CashPosition({ data }: { data: CashData }) {
  const { inflow, outflow, net, breakdown, aging, payableTotal, pending } = data;

  if (inflow === 0 && outflow === 0 && payableTotal === 0) {
    return (
      <SignatureShell eyebrow="Cash position" icon={Scale}>
        <SignatureNote>No cash movement recorded this month.</SignatureNote>
      </SignatureShell>
    );
  }

  return (
    <SignatureShell
      eyebrow="Cash position · this month"
      icon={Scale}
      hero={money(net)}
      heroLabel="net"
      tone={net >= 0 ? "go" : "bad"}
    >
      <Beam inflow={inflow} outflow={outflow} breakdown={breakdown} />

      {/* ── Payables aging ── */}
      {payableTotal > 0 && (
        <div style={{ borderTop: "1px solid var(--color-line)" }}>
          <div className="flex items-baseline justify-between gap-2 px-3 pt-1.5 pb-1">
            <span
              className="text-m-micro font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--color-ink-400)" }}
            >
              Payables
            </span>
            <span
              className="text-m-caption font-bold tabular-nums"
              style={{ color: "var(--color-ink-950)" }}
            >
              {money(payableTotal)}
            </span>
          </div>
          <div className="px-3 pb-2 space-y-1">
            {aging
              .filter((b) => b.count > 0)
              .map((b, i) => (
                <LadderRung
                  key={b.id}
                  bucket={b}
                  max={Math.max(1, ...aging.map((x) => x.amount))}
                  index={i}
                />
              ))}
          </div>
        </div>
      )}

      {/* ── Sitting on your desk ── */}
      {pending && pending.expenses > 0 && (
        <Link
          href="/m/expenses"
          className="sig-row press flex items-center gap-1.5 px-3 py-1.5"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          <Clock3 className="size-3 shrink-0" style={{ color: "var(--color-signal)" }} />
          <span className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
            <span className="font-bold tabular-nums">{pending.expenses}</span>{" "}
            {pending.expenses === 1 ? "expense" : "expenses"} awaiting your approval
          </span>
        </Link>
      )}
    </SignatureShell>
  );
}

/* ── The beam ────────────────────────────────────────────────────────────
   Both sides scale against the same max, so bar length is comparable
   across the centre line. This is the component's core idea and the one
   thing that must not be "improved" into two independent bars. */

function Beam({
  inflow,
  outflow,
  breakdown,
}: {
  inflow: number;
  outflow: number;
  breakdown: CashData["breakdown"];
}) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setGrown(true), 40);
    return () => clearTimeout(t);
  }, []);

  const max = Math.max(inflow, outflow, 1);
  const inPct = (inflow / max) * 100;
  const outPct = (outflow / max) * 100;

  return (
    <div className="px-3 py-2.5">
      {/* Out — grows leftward from the centre */}
      <Side
        align="left"
        label="Paid out"
        amount={outflow}
        pct={grown ? outPct : 0}
        tone="bad"
        icon={ArrowUpRight}
        detail={`${money(breakdown.suppliers)} suppliers · ${money(breakdown.expenses)} expenses`}
      />

      {/* The axis the two sides share */}
      <div
        className="my-1 h-px w-full"
        style={{ backgroundColor: "var(--color-line)" }}
        aria-hidden
      />

      {/* In — grows rightward from the centre */}
      <Side
        align="right"
        label="Received"
        amount={inflow}
        pct={grown ? inPct : 0}
        tone="go"
        icon={ArrowDownLeft}
        detail={`${money(breakdown.sales)} sales · ${money(breakdown.rent)} rent`}
      />
    </div>
  );
}

function Side({
  align,
  label,
  amount,
  pct,
  tone,
  icon: Icon,
  detail,
}: {
  align: "left" | "right";
  label: string;
  amount: number;
  pct: number;
  tone: Tone;
  icon: typeof ArrowUpRight;
  detail: string;
}) {
  const color = toneColor(tone);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Icon className="size-3 shrink-0" style={{ color }} />
          <span
            className="text-m-caption font-semibold"
            style={{ color: "var(--color-ink-700)" }}
          >
            {label}
          </span>
        </span>
        <span
          className="text-m-body font-bold tabular-nums shrink-0"
          style={{ color }}
        >
          {money(amount)}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, backgroundColor: "var(--color-concrete)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            marginLeft: align === "right" ? 0 : "auto",
            backgroundColor: color,
            transition: "width 560ms var(--ease-out)",
          }}
        />
      </div>
      <p className="mt-0.5 text-m-micro truncate" style={{ color: "var(--color-ink-400)" }}>
        {detail}
      </p>
    </div>
  );
}

/* ── One aging bucket ────────────────────────────────────────────────── */

function LadderRung({
  bucket,
  max,
  index,
}: {
  bucket: CashBucket;
  max: number;
  index: number;
}) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setGrown(true), 40 + index * 40);
    return () => clearTimeout(t);
  }, [index]);

  const tone = BUCKET_TONE[bucket.id] ?? "steel";
  const color = toneColor(tone);

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-m-micro font-semibold w-[3.25rem] shrink-0 tabular-nums"
        style={{ color: "var(--color-ink-500)" }}
      >
        {bucket.label}
      </span>
      <span
        className="flex-1 min-w-0 rounded-full overflow-hidden"
        style={{ height: 5, backgroundColor: "var(--color-concrete)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: grown ? `${(bucket.amount / max) * 100}%` : "0%",
            backgroundColor: color,
            transition: "width 520ms var(--ease-out)",
          }}
        />
      </span>
      <span
        className="text-m-micro font-bold tabular-nums shrink-0 w-12 text-right"
        style={{ color }}
      >
        {money(bucket.amount)}
      </span>
    </div>
  );
}
