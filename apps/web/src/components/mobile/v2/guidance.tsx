"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Info, CheckCircle2, ArrowRight, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {FLOWS, nextActionFor, type FlowId} from "@/lib/flow-map";

/* ═══════════════════════════════════════════════════════════════════════════
   GUIDANCE PRIMITIVES — orientation that merges into the page

   These extend the mobile v2 warm-palette primitives with the
   "what is this page / where am I / what's next" layer. The contract,
   inherited from the existing Callout rule ("a callout must always
   carry an action, or it is nagging"):

     Every guidance element either
       (a) explains the current screen in one line   → PageLead
       (b) shows where you are in a flow              → FlowStrip / ContextTag
       (c) offers a single next action on this page   → NextActionCard / DoneStrip

   If it does none of these, it's decoration — don't render it.

   All colours come from the same --color-ink-* / --color-paper /
   --color-signal / --color-go / --color-stop tokens the rest of /m
   uses, so guidance never looks like a foreign chrome layer.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── PageLead ──────────────────────────────────────────────────────────────

/**
 * A single muted line directly under a page title. Answers "what is
 * this page for" in one sentence, without a manual.
 *
 * Disappears for returning users (visited ≥ 3 times) — tracked in
 * localStorage, no backend. The first few visits are when orientation
 * matters; after that it's noise.
 *
 * Usage:
 *   <PageLead text="Purchase orders to suppliers. Drafts need approval, ordered POs need receiving." />
 *
 * Or wire it from the flow-map so the lead stays in one place:
 *   <PageLead flow="procurement" />
 */
const VISIT_KEY = "nirman:page-visits";

function useVisitCount(route: string): number {
  const [count, setCount] = React.useState<number>(0);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(VISIT_KEY);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      const next = (map[route] ?? 0) + 1;
      map[route] = next;
      localStorage.setItem(VISIT_KEY, JSON.stringify(map));
      setCount(next);
    } catch {
      // localStorage disabled (private mode) — treat as always-first-visit
      setCount(1);
    }
  }, [route]);
  return count;
}

export function PageLead({
  text,
  flow,
  /** Override the auto-collapse threshold. Default: hide after 3 visits. */
  dismissAfter = 3,
}: {
  text?: string;
  flow?: FlowId;
  dismissAfter?: number;
}) {
  const pathname = usePathname();
  const visits = useVisitCount(pathname);

  const lead = text ?? (flow ? FLOWS[flow].listLead : undefined);
  if (!lead) return null;

  // Returning users don't need the orientation line.
  if (visits > dismissAfter) return null;

  return (
    <p
      className="text-m-caption leading-relaxed mb-3 -mt-1"
      style={{ color: "var(--color-ink-500)" }}
    >
      {lead}
    </p>
  );
}

// ─── NextActionCardView (presentational, server-safe) ─────────────────────

/**
 * The presentational shell — renders a pre-resolved next action.
 * Server components use this with `resolveNextAction()` from the
 * flow-map (which checks permissions on the server). Client
 * components use `<NextActionCard>` which wraps this.
 */
export function NextActionCardView({
  label,
  reason,
  href,
  hash,
  tone = "signal",
  actionVerb = "Do",
  onClick,
}: {
  label: string;
  reason: string;
  href?: string;
  hash?: string;
  tone?: "signal" | "go" | "stop";
  actionVerb?: string;
  onClick?: () => void;
}) {
  return (
    <ActionCardShell
      tone={tone}
      label={label}
      reason={reason}
      href={href}
      hash={hash}
      onClick={onClick}
      actionVerb={actionVerb}
    />
  );
}

// ─── NextActionCard (client, resolves from flow-map) ──────────────────────

/**
 * The one thing you should do next, as a card. Only renders when
 * there's a next action the current user can perform — never an empty
 * card. The action stays on the same page (anchor / filter chip) when
 * possible; only navigates when there's genuinely no on-page action.
 *
 * Two modes:
 *   1. Record-level: pass `flow` + `status` + `can(perm)`. Reads the
 *      next action from the flow-map.
 *   2. List-level: pass `flow` + `count` + `can`. Reads the listNext
 *      from the flow-map (e.g. "3 drafts awaiting approval").
 */
export function NextActionCard({
  flow,
  status,
  count,
  can,
  recordId,
}: {
  flow: FlowId;
  /** Record status — for detail pages. */
  status?: string;
  /** Queue count — for list pages (uses flow.listNext). */
  count?: number;
  /** Permission checker: (perm) => boolean. */
  can: (perm: string) => boolean;
  /** Record id — substituted into navigate hrefs. */
  recordId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // List-level next action
  if (count !== undefined) {
    const def = FLOWS[flow].listNext;
    if (!def) return null;
    if (def.perm && !can(def.perm)) return null;
    if (count <= 0) return null;

    const handleFilter = () => {
      // Apply the filter chip on the same page via query param.
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("status", def.filterChip);
      router.replace(`${pathname()}?${params.toString()}`);
    };

    return (
      <ActionCardShell
        tone="signal"
        label={def.label(count)}
        reason={def.reason}
        onClick={handleFilter}
        actionVerb="Show"
      />
    );
  }

  // Record-level next action
  if (!status) return null;
  const action = nextActionFor(flow, status, can);
  if (!action) return null;

  const act = action.action;
  const href = act.type === "navigate" ? act.href.replace("{id}", recordId ?? "") : undefined;
  const filterChip = act.type === "filter" ? act.chip : null;
  const handleClick =
    filterChip !== null
      ? () => {
          const params = new URLSearchParams(searchParams?.toString() ?? "");
          params.set("status", filterChip);
          router.replace(`${pathname()}?${params.toString()}`);
        }
      : undefined;

  return (
    <ActionCardShell
      tone={action.tone ?? "signal"}
      label={action.label}
      reason={action.reason}
      href={href}
      hash={act.type === "anchor" ? act.hash : undefined}
      onClick={handleClick}
      actionVerb="Do"
    />
  );
}

// pathname() helper — useSearchParams forces "use client" so this is safe
function pathname(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function ActionCardShell({
  tone,
  label,
  reason,
  href,
  hash,
  onClick,
  actionVerb,
}: {
  tone: "signal" | "go" | "stop";
  label: string;
  reason: string;
  href?: string;
  hash?: string;
  onClick?: () => void;
  actionVerb: string;
}) {
  const accent =
    tone === "go" ? "var(--color-go)" : tone === "stop" ? "var(--color-stop)" : "var(--color-signal)";
  const _accentDark =
    tone === "go" ? "var(--color-go)" : tone === "stop" ? "var(--color-stop)" : "var(--color-signal-dark)";
  const wash =
    tone === "go" ? "var(--color-go-wash)" : tone === "stop" ? "var(--color-stop-wash)" : "var(--color-signal-wash)";

  const body = (
    <div className="flex items-center gap-3 p-3">
      <span
        className="grid place-items-center w-8 h-8 rounded-full shrink-0"
        style={{ backgroundColor: wash }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accent }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-m-strong leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-m-caption mt-0.5 leading-snug" style={{ color: "var(--color-ink-500)" }}>
          {reason}
        </p>
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-1 rounded-[0.5rem] px-3 h-9 text-m-section font-bold text-m-body press"
        style={{ backgroundColor: accent, color: tone === "signal" ? "var(--color-ink-950)" : "#fff" }}
      >
        {actionVerb}
        <ArrowRight className="size-3.5" />
      </span>
    </div>
  );

  const cls = "block rounded-[0.625rem] border-l-[3px] mb-3 text-m-body overflow-hidden press";
  const style: React.CSSProperties = {
    borderLeftColor: accent,
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {body}
      </Link>
    );
  }
  if (hash) {
    return (
      <a href={hash} className={cls} style={style}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${cls} w-full text-left`} style={style}>
      {body}
    </button>
  );
}

// ─── ContextTag ────────────────────────────────────────────────────────────

/**
 * A tiny chip showing where this thing came from — the "before" in the
 * flow. "from Requisition RQ-2401-012", "to Project Riviera · Unit B-204".
 * Tappable → navigates to the parent.
 *
 * This formalises the ad-hoc source-requisition / project links that
 * already live on /m/procurement/[id] into one reusable chip.
 */
export function ContextTag({
  icon: Icon,
  prefix,
  label,
  href,
}: {
  icon?: LucideIcon;
  /** "from" / "to" / "for" — the relationship word. */
  prefix?: string;
  label: string;
  href?: string;
}) {
  const content = (
    <>
      {Icon && <Icon className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />}
      {prefix && (
        <span style={{ color: "var(--color-ink-400)" }}>{prefix} </span>
      )}
      <span className="truncate underline underline-offset-2">{label}</span>
    </>
  );

  const cls = "inline-flex items-center gap-1 text-m-label press";

  if (href) {
    return (
      <Link href={href} className={cls} style={{ color: "var(--color-steel)" }}>
        {content}
      </Link>
    );
  }
  return (
    <span className={cls} style={{ color: "var(--color-steel)" }}>
      {content}
    </span>
  );
}

// ─── DoneStrip ─────────────────────────────────────────────────────────────

/**
 * "What just happened, and what's next" — replaces a floating toast
 * for successful mutations. Stays on-page (no portal) so it never
 * covers the bottom action bar where the user's thumb is. Auto-hides
 * after 5s.
 *
 * The next-action link is the actual next flow step. Use it after any
 * mutation that moves a record forward in its flow.
 */
export function DoneStrip({
  message,
  nextLabel,
  nextHref,
  onDismiss,
  duration = 5000,
}: {
  message: string;
  nextLabel?: string;
  nextHref?: string;
  onDismiss?: () => void;
  duration?: number;
}) {
  const [show, setShow] = React.useState(true);

  React.useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(() => {
      setShow(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  if (!show) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 px-3 pt-2"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="mx-auto max-w-md rounded-[0.625rem] border-l-[3px] flex items-center gap-2.5 px-3 py-2.5 text-m-body shadow-sm"
        style={{
          pointerEvents: "auto",
          borderLeftColor: "var(--color-go)",
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
        <p className="text-m-caption flex-1 leading-snug" style={{ color: "var(--color-ink-950)" }}>
          {message}
        </p>
        {nextLabel && nextHref && (
          <Link
            href={nextHref}
            className="shrink-0 inline-flex items-center gap-1 text-m-body font-bold text-m-body press"
            style={{ color: "var(--color-signal-dark)" }}
            onClick={() => setShow(false)}
          >
            {nextLabel}
            <ChevronRight className="size-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── MobileFieldHint ───────────────────────────────────────────────────────

/**
 * The inline "why this field matters" — appears under a form field
 * when it's focused or empty. Explains the business rule, not the
 * label. Disappears once the field has a value (for required fields)
 * or on blur (for optional).
 *
 * This is the mobile warm-palette cousin of the desktop `Hint`. Same
 * contract: one line, Info icon, plain language.
 */
export function MobileFieldHint({
  children,
  show = true,
  tone = "default",
}: {
  children: React.ReactNode;
  /** Show only when focused / empty — caller controls this. */
  show?: boolean;
  tone?: "default" | "warning";
}) {
  if (!show) return null;
  return (
    <p
      className="flex items-start gap-1.5 text-m-label leading-relaxed mt-1"
      style={{
        color: tone === "warning" ? "var(--color-signal-dark)" : "var(--color-ink-500)",
      }}
    >
      <Info className="size-3 shrink-0 mt-0.5 opacity-70" />
      <span>{children}</span>
    </p>
  );
}
