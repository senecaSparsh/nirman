"use client";

import * as React from "react";
import Link from "next/link";
import {
  Clock,
  LogIn,
  LogOut,
  Truck,
  ClipboardList,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { SignatureShell, SignatureNote, clock, type Tone } from "./shared";

/* ═══════════════════════════════════════════════════════════════════════════
   SHIFT RAIL — the field persona's signature component

   A site engineer's day is not a hierarchy and not a funnel. It is a
   SEQUENCE: arrive, receive what's landing, work the punch list, file the
   DPR, leave. So the organising axis is time, and the component is a
   vertical rail the day runs down.

   The rail encodes state positionally rather than with badges:
     • done   — filled dot, spine above it is solid
     • next   — ringed dot, the only accented row on screen
     • ahead  — hollow dot, muted spine

   That means "where am I in my day" is answered by where the colour stops,
   with no reading required. Exactly one row is ever accented, so the eye
   has a single landing point (Apple §16: hierarchy through contrast).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ShiftData {
  employee: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  attendance: {
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    hoursWorked: number | null;
    location: string | null;
  } | null;
  dpr: { submitted: boolean; status: string | null; id: string | null };
  tasks: {
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
    overdue: boolean;
  }[];
  deliveries: {
    id: string;
    poNumber: string;
    supplierName: string;
    expectedDate: string | null;
  }[];
}

type RailState = "done" | "next" | "ahead";

interface RailEvent {
  key: string;
  icon: LucideIcon;
  time: string | null;
  title: string;
  sub?: string;
  href: string;
  done: boolean;
  tone?: Tone;
}

export function ShiftRail({ data }: { data: ShiftData }) {
  const { attendance, dpr, tasks, deliveries, site } = data;
  const checkedIn = !!attendance?.checkIn;
  const checkedOut = !!attendance?.checkOut;
  const openTasks = tasks.length;

  // The day, in the order it actually happens. Deliveries and tasks sit
  // between the two attendance anchors because that is when they occur —
  // ordering by narrative beats ordering by timestamp when half the items
  // have no timestamp at all.
  const events: RailEvent[] = [];

  events.push({
    key: "in",
    icon: LogIn,
    time: clock(attendance?.checkIn ?? null),
    title: checkedIn ? "Checked in" : "Check in",
    sub: checkedIn
      ? (attendance?.location ?? site?.name ?? undefined)
      : "Tap to mark attendance",
    href: "/m/site/attendance",
    done: checkedIn,
  });

  for (const d of deliveries) {
    events.push({
      key: `po-${d.id}`,
      icon: Truck,
      // Deliveries are all-day events — expectedDate carries no usable
      // time, and "00:00" on the rail reads like a bug, not a schedule.
      time: null,
      title: `Receive ${d.poNumber}`,
      sub: d.supplierName,
      href: "/m/site/field",
      done: false,
      tone: "steel",
    });
  }

  if (openTasks > 0) {
    const overdue = tasks.filter((t) => t.overdue).length;
    events.push({
      key: "tasks",
      icon: ListChecks,
      time: null,
      title: `${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`,
      sub: overdue > 0 ? `${overdue} overdue · ${tasks[0]!.title}` : tasks[0]!.title,
      href: "/m/site/tasks",
      done: false,
      tone: overdue > 0 ? "bad" : "neutral",
    });
  }

  events.push({
    key: "dpr",
    icon: ClipboardList,
    time: null,
    title: dpr.submitted ? "DPR filed" : "File today's DPR",
    sub: dpr.submitted
      ? (dpr.status ?? "Submitted").toLowerCase().replace(/_/g, " ")
      : site
        ? site.name
        : "Daily progress report",
    href: dpr.submitted && dpr.id ? `/m/dprs/${dpr.id}` : "/m/site/dpr",
    done: dpr.submitted,
  });

  events.push({
    key: "out",
    icon: LogOut,
    time: clock(attendance?.checkOut ?? null),
    title: checkedOut ? "Checked out" : "Check out",
    sub: checkedOut
      ? attendance?.hoursWorked != null
        ? `${attendance.hoursWorked.toFixed(1)} h on site`
        : undefined
      : "End of shift",
    href: "/m/site/attendance",
    done: checkedOut,
  });

  // "Next" is the first unfinished step — the single accented row.
  const nextIndex = events.findIndex((e) => !e.done);

  const hero = checkedIn
    ? attendance?.hoursWorked != null
      ? attendance.hoursWorked.toFixed(1)
      : (clock(attendance!.checkIn) ?? "—")
    : "—";
  const heroLabel = checkedIn
    ? attendance?.hoursWorked != null
      ? "h"
      : "in"
    : "not in";

  return (
    <SignatureShell
      eyebrow={site ? `Today · ${site.name}` : "Today"}
      icon={Clock}
      hero={hero}
      heroLabel={heroLabel}
      tone={checkedIn ? "go" : "warn"}
    >
      {!data.employee ? (
        <SignatureNote>
          No employee record linked to your account — attendance and DPR
          steps will appear once HR links one.
        </SignatureNote>
      ) : (
        <div className="px-3 py-2">
          {events.map((e, i) => (
            <RailRow
              key={e.key}
              event={e}
              index={i}
              state={e.done ? "done" : i === nextIndex ? "next" : "ahead"}
              first={i === 0}
              last={i === events.length - 1}
            />
          ))}
        </div>
      )}
    </SignatureShell>
  );
}

/* ── One step on the rail ─────────────────────────────────────────────── */

function RailRow({
  event,
  state,
  first,
  last,
  index,
}: {
  event: RailEvent;
  state: RailState;
  first: boolean;
  last: boolean;
  index: number;
}) {
  const Icon = event.icon;
  const accent =
    state === "done"
      ? "var(--color-go)"
      : state === "next"
        ? event.tone === "bad"
          ? "var(--color-danger)"
          : "var(--color-ink-950)"
        : "var(--color-ink-300)";
  // The spine above a dot is solid once that step is behind you, so the
  // colour literally stops at "now".
  const spineAbove = state === "done" ? "var(--color-go)" : "var(--color-line)";
  const spineBelow = state === "done" ? "var(--color-go)" : "var(--color-line)";

  return (
    <Link
      href={event.href}
      className="sig-row press relative flex gap-2.5 items-stretch"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Spine + dot */}
      <div className="relative flex flex-col items-center w-3 shrink-0">
        <div
          className="w-px flex-1"
          style={{ backgroundColor: first ? "transparent" : spineAbove }}
        />
        <div
          className="grid place-items-center rounded-full shrink-0 my-0.5"
          style={{
            width: state === "next" ? 9 : 7,
            height: state === "next" ? 9 : 7,
            backgroundColor: state === "ahead" ? "var(--color-paper)" : accent,
            border: `1.5px solid ${accent}`,
            // The "next" dot gets a soft halo instead of a pulse — a
            // looping animation on a screen you check 40x a day is noise.
            boxShadow:
              state === "next"
                ? `0 0 0 3px color-mix(in srgb, ${accent} 16%, transparent)`
                : undefined,
          }}
        />
        <div
          className="w-px flex-1"
          style={{ backgroundColor: last ? "transparent" : spineBelow }}
        />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 flex items-center gap-2 py-1">
        <Icon
          className="size-3 shrink-0"
          style={{
            color: state === "ahead" ? "var(--color-ink-300)" : accent,
          }}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-m-body truncate ${state === "next" ? "font-bold" : "font-semibold"}`}
            style={{
              color:
                state === "ahead"
                  ? "var(--color-ink-500)"
                  : state === "done"
                    ? "var(--color-ink-700)"
                    : "var(--color-ink-950)",
              // A finished step is struck only by colour, never by a
              // line-through — the text still has to be readable.
              textDecoration: "none",
            }}
          >
            {event.title}
          </p>
          {event.sub && (
            <p
              className="text-m-caption truncate first-letter:uppercase"
              style={{ color: "var(--color-ink-400)" }}
            >
              {event.sub}
            </p>
          )}
        </div>
        {event.time && (
          <span
            className="text-m-caption font-semibold tabular-nums shrink-0"
            style={{
              color: state === "done" ? "var(--color-go)" : "var(--color-ink-400)",
            }}
          >
            {event.time}
          </span>
        )}
      </div>
    </Link>
  );
}
