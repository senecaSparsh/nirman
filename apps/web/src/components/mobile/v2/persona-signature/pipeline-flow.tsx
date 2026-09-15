"use client";

import * as React from "react";
import Link from "next/link";
import {
  Workflow,
  Inbox,
  FileText,
  ClipboardCheck,
  Truck,
  PackageCheck,
  Receipt,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { SignatureShell, SignatureNote, ageLabel, toneColor, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   PIPELINE FLOW — the procurement persona's signature component

   Procurement is a conveyor belt: a requisition becomes a quote becomes a
   PO becomes a delivery becomes a bill. The role's whole job is keeping
   things MOVING, so the axis is stage progression and the component is the
   belt itself.

   Two facts per stage, and they are deliberately encoded differently:

     ▸ COUNT — the number in the node. How much is here.
     ▸ AGE   — the colour of the node. How long the oldest item has sat.

   That split matters. A stage with 40 items that all arrived today is
   healthy; a stage with 1 item that has sat for three weeks is the actual
   problem. A pure count display hides exactly the thing procurement needs
   to see, which is why the oldest item drives colour, not volume.

   Tapping a node reveals its detail row — the same select-to-drill idiom
   as the executive's orbit, so the two feel like the same product.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PipelineStage {
  id: string;
  label: string;
  sub: string;
  count: number;
  oldestDays: number | null;
  oldestRef: string | null;
  href: string;
}

export interface PipelineData {
  stages: PipelineStage[];
}

const STAGE_ICONS: Record<string, LucideIcon> = {
  requisitions: Inbox,
  quotes: FileText,
  "po-approval": ClipboardCheck,
  "in-transit": Truck,
  inspection: PackageCheck,
  invoices: Receipt,
};

/** Age → tone. 14d is the point where a stalled item stops being normal. */
function ageTone(days: number | null, count: number): Tone {
  if (count === 0) return "neutral";
  if (days == null) return "steel";
  if (days >= 14) return "bad";
  if (days >= 7) return "warn";
  return "go";
}

export function PipelineFlow({ data }: { data: PipelineData }) {
  const { stages } = data;
  const [active, setActive] = React.useState<string | null>(null);

  const total = stages.reduce((s, x) => s + x.count, 0);
  const stuck = stages.filter((s) => s.count > 0 && (s.oldestDays ?? 0) >= 14);

  if (stages.length === 0) {
    return (
      <SignatureShell eyebrow="Pipeline" icon={Workflow}>
        <SignatureNote>Procurement pipeline is not available.</SignatureNote>
      </SignatureShell>
    );
  }

  const selected = stages.find((s) => s.id === active) ?? null;

  return (
    <SignatureShell
      eyebrow="Pipeline"
      icon={Workflow}
      hero={String(total)}
      heroLabel="in flight"
      tone={stuck.length > 0 ? "bad" : "neutral"}
    >
      {/* ── The belt ──
          Horizontally scrollable so six stages never squeeze below a
          tappable size on a narrow phone. */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex items-start gap-0 px-3 py-2.5 w-max">
          {stages.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <ArrowRight
                  className="size-2.5 shrink-0 mt-[1.0625rem]"
                  style={{ color: "var(--color-ink-300)" }}
                  aria-hidden
                />
              )}
              <StageNode
                stage={s}
                index={i}
                active={active === s.id}
                onSelect={() =>
                  setActive((cur) => (cur === s.id ? null : s.id))
                }
              />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Selected stage detail ── */}
      {selected && (
        <div
          className="sig-row px-3 py-2"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p
                className="text-m-body font-bold truncate"
                style={{ color: "var(--color-ink-950)" }}
              >
                {selected.label}
              </p>
              <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {selected.count === 0
                  ? "Nothing waiting here"
                  : selected.oldestDays != null
                    ? `${selected.sub} · oldest ${ageLabel(selected.oldestDays)}${selected.oldestRef ? ` (${selected.oldestRef})` : ""}`
                    : selected.sub}
              </p>
            </div>
            <Link
              href={selected.href}
              className="press shrink-0 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              Open
            </Link>
          </div>
        </div>
      )}

      {/* ── Stalled callout ──
          Only rendered when something is genuinely stuck. A dashboard that
          always shows a warning slot trains people to ignore the slot. */}
      {!selected && stuck.length > 0 && (
        <div
          className="sig-row px-3 py-1.5 flex items-center gap-1.5"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          <span
            className="size-1.5 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-danger)" }}
          />
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>
            <span className="font-bold">{stuck[0]!.label}</span> stalled —
            oldest {ageLabel(stuck[0]!.oldestDays)}
            {stuck.length > 1 ? ` · +${stuck.length - 1} more` : ""}
          </p>
        </div>
      )}
    </SignatureShell>
  );
}

/* ── One stage on the belt ───────────────────────────────────────────── */

function StageNode({
  stage,
  active,
  onSelect,
  index,
}: {
  stage: PipelineStage;
  active: boolean;
  onSelect: () => void;
  index: number;
}) {
  const empty = stage.count === 0;
  const tone = ageTone(stage.oldestDays, stage.count);
  const color = toneColor(tone);
  const Icon = STAGE_ICONS[stage.id] ?? Inbox;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="sig-row press flex flex-col items-center gap-1 w-[3.25rem] shrink-0"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <span
        className="relative grid place-items-center rounded-[0.5rem] w-9 h-9 transition-all"
        style={{
          backgroundColor: empty
            ? "var(--color-paper-2)"
            : `color-mix(in srgb, ${color} 12%, var(--color-paper))`,
          border: `1px solid ${active ? "var(--color-ink-950)" : empty ? "var(--color-line)" : `color-mix(in srgb, ${color} 40%, transparent)`}`,
          // Selection lifts rather than recolours, so the age colour the
          // node is carrying is never overwritten by the selected state.
          boxShadow: active ? "0 2px 8px rgba(0,0,0,0.12)" : undefined,
          transform: active ? "translateY(-1px)" : undefined,
        }}
      >
        <Icon
          className="size-3"
          style={{ color: empty ? "var(--color-ink-300)" : color }}
        />
        <span
          className="absolute -top-1 -right-1 grid place-items-center min-w-[0.875rem] h-3.5 rounded-full px-1 text-m-micro font-bold tabular-nums"
          style={{
            backgroundColor: empty ? "var(--color-concrete)" : color,
            color: empty ? "var(--color-ink-400)" : "var(--color-paper)",
          }}
        >
          {stage.count > 99 ? "99" : stage.count}
        </span>
      </span>
      <span
        className="text-m-micro font-semibold text-center leading-tight w-full"
        style={{
          color: empty ? "var(--color-ink-300)" : "var(--color-ink-700)",
        }}
      >
        {stage.label}
      </span>
    </button>
  );
}
