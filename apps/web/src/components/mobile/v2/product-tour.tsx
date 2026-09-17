"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check, Compass, X } from "lucide-react";
import { toast } from "sonner";
import type { Persona } from "@/lib/mobile-nav-v2";
import { buildTourSteps, type TourStep } from "@/lib/tour-steps";
import { useFetch, clearFetchCache } from "@/lib/use-fetch";
import { MobileDialog } from "./dialog";
import { haptic } from "@/lib/haptic";

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUCT TOUR — a persona-driven spotlight walkthrough of the mobile shell.

   Mounted once inside MobileShellV2 (the /m layout persists across
   client-side navigation, so the tour survives the one route change it
   performs — pushing the user to their module hub for the quick-actions
   step, which is ALWAYS first: it's the feature users must learn before
   anything else).

   Mechanics:
     · Spotlight = a ring div positioned over the target's live
       bounding rect; the dim is the ring's own box-shadow (0 0 0 9999px),
       which leaves the target fully lit — a real cutout, not a dimmed clone.
     · The rect is re-read every animation frame while the step is visible,
       so the ring tracks scrolling <main> content, FAB-fan openings and
       mobile URL-bar resizes without any listener wiring.
     · Targets are `data-tour` attributes — a contract decoupled from
       classnames, so restyling a component can't silently break the tour.
     · A step whose target never mounts (~4s) is skipped, not an error —
       permission-gated chrome (DeptFab) simply doesn't exist for some users.
     · Steps may declare a `route`: if we're not on it we push once; if the
       user navigates away anyway (browser back), the tour ends rather than
       fighting them — the overlay blocks taps but can't block the OS.

   Persistence:
     · Server: UserPreference "tour:v1" via /api/me/tour — per user, per
       company, follows the account to any device.
     · Mirror: localStorage "nirman-tour-v1" — covers offline use, fetch
       failures, and the dev AUTH_BYPASS user whose writes can't persist.
     · Replay: a "nirman:start-tour" window event restarts the tour from
       anywhere (the Settings → App tour row dispatches it).
   ═══════════════════════════════════════════════════════════════════════════ */

const TOUR_LS_KEY = "nirman-tour-v1";
export const TOUR_START_EVENT = "nirman:start-tour";

interface TourStateResponse {
  state: { status: "done" | "skipped"; at: string; steps: number } | null;
}

export function ProductTour({
  persona,
  canSwitchCompany,
  enabled = true,
}: {
  persona: Persona;
  canSwitchCompany: boolean;
  /** False when the shell had no server bootstrap (unauthenticated) —
   *  the auth guard is already redirecting; don't flash a sheet first. */
  enabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = React.useMemo(
    () => buildTourSteps(persona, { canSwitchCompany }),
    [persona, canSwitchCompany],
  );

  const { data, loading } = useFetch<TourStateResponse>("/api/me/tour", {
    skip: !enabled,
  });

  const [phase, setPhase] = React.useState<"idle" | "welcome" | "running" | "off">("idle");
  const [stepIndex, setStepIndex] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [ready, setReady] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = React.useState(170);
  /** The step we already issued a router.push for — distinguishes "tour's
   *  own navigation" from "user left the page". */
  const pushedForStep = React.useRef<number | null>(null);

  // ── Offer the welcome sheet once — only when the server AND this device
  //    both say the tour was never finished. ──
  React.useEffect(() => {
    if (!enabled || loading || phase !== "idle") return;
    const serverDone = !!data?.state;
    let localDone = false;
    try {
      localDone = !!localStorage.getItem(TOUR_LS_KEY);
    } catch {
      /* private mode — storage can throw */
    }
    if (serverDone || localDone) {
      setPhase("off");
      return;
    }
    // Small delay so the sheet doesn't fight first paint / hydration.
    const t = setTimeout(
      () => setPhase((p) => (p === "idle" ? "welcome" : p)),
      900,
    );
    return () => clearTimeout(t);
  }, [enabled, loading, data, phase]);

  // ── Replay entry point (Settings → App tour, or anywhere else). ──
  React.useEffect(() => {
    const onStart = () => {
      pushedForStep.current = null;
      setStepIndex(0);
      setPhase("running");
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  const persist = React.useCallback(
    (status: "done" | "skipped") => {
      try {
        localStorage.setItem(TOUR_LS_KEY, status);
      } catch {
        /* storage unavailable — server write still attempts */
      }
      clearFetchCache("/api/me/tour");
      void fetch("/api/me/tour", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, steps: steps.length }),
      }).catch(() => {
        /* non-fatal — the local mirror already recorded it */
      });
    },
    [steps.length],
  );

  const finish = React.useCallback(() => {
    persist("done");
    setPhase("off");
    haptic.success();
    toast.success("You're all set — replay the tour anytime from Settings → App tour.");
  }, [persist]);

  const skip = React.useCallback(() => {
    persist("skipped");
    setPhase("off");
  }, [persist]);

  const advance = React.useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      finish();
      return;
    }
    haptic.light();
    setStepIndex(stepIndex + 1);
  }, [stepIndex, steps.length, finish]);

  const step: TourStep | undefined = phase === "running" ? steps[stepIndex] : undefined;

  // ── Step engine: route → target → rect tracking. Re-runs on navigation
  //    (pathname is what makes the tour's own router.push resolve). ──
  React.useEffect(() => {
    if (phase !== "running" || !step) return;
    let cancelled = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 1) Routed step: get to the right page first.
    if (step.route && pathname !== step.route) {
      if (pushedForStep.current === stepIndex) {
        // We already pushed and still aren't there — the user navigated
        // away deliberately (browser back). End rather than fight them.
        setPhase("off");
        return;
      }
      pushedForStep.current = stepIndex;
      router.push(step.route);
      timer = setTimeout(() => {
        // Navigation never resolved (blocked by a guard, dead link) —
        // drop the step rather than stall.
        if (!cancelled) advance();
      }, 5000);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    // 2) Centered card (no DOM target — the finale "daily loop" card).
    if (!step.target) {
      setRect(null);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    // 3) Spotlight step: poll for the target, scroll it into view, then
    //    track its rect every frame until the step changes.
    setReady(false);
    const startedAt = Date.now();

    const track = (el: Element) => {
      if (cancelled) return;
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(() => track(el));
    };

    const poll = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        raf = requestAnimationFrame(() => track(el));
        // Brief beat so the card doesn't pop over a mid-scroll target.
        timer = setTimeout(() => {
          if (!cancelled) setReady(true);
        }, 140);
        return;
      }
      if (Date.now() - startedAt > (step.waitMs ?? 1200)) {
        advance(); // target never mounted (gated feature) — skip the step
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [phase, stepIndex, pathname, step, router, advance]);

  // ── Measure the card so above/below placement is exact. useEffect, not
  //    useLayoutEffect: the card renders invisible until `ready`, so a
  //    post-paint measure costs nothing and avoids the SSR warning. ──
  React.useEffect(() => {
    if (ready && cardRef.current) {
      setCardH(cardRef.current.offsetHeight);
    }
  }, [ready, stepIndex]);

  // ── Escape skips the tour. ──
  React.useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, skip]);

  if (!enabled || phase === "idle" || phase === "off") return null;

  // ── Welcome sheet — the first-run offer. ──
  if (phase === "welcome") {
    return (
      <MobileDialog open onClose={skip} title="Quick tour">
        <div className="px-4 pb-4">
          <div
            className="mx-auto mb-3 grid size-11 place-items-center rounded-full"
            style={{ backgroundColor: "var(--color-signal-wash)" }}
          >
            <Compass className="size-5" style={{ color: "var(--color-signal-dark)" }} />
          </div>
          <p
            className="text-m-body text-center mb-1"
            style={{ color: "var(--color-ink-700)" }}
          >
            A {steps.length}-step walkthrough of the essentials — starting with
            Quick Actions, the grid where your daily work begins.
          </p>
          <p
            className="text-m-caption text-center mb-4"
            style={{ color: "var(--color-ink-400)" }}
          >
            About a minute. You can replay it anytime from Settings.
          </p>
          <div className="flex gap-2">
            <button
              onClick={skip}
              className="flex-1 rounded-[0.625rem] border py-2.5 text-m-body font-semibold press"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-700)",
              }}
            >
              Not now
            </button>
            <button
              onClick={() => {
                haptic.medium();
                pushedForStep.current = null;
                setStepIndex(0);
                setPhase("running");
              }}
              className="flex-1 rounded-[0.625rem] py-2.5 text-m-body font-bold press"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              Start tour
            </button>
          </div>
        </div>
      </MobileDialog>
    );
  }

  // ── Running — spotlight + tooltip. ──
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(320, vw - 24);
  const pad = 5;
  const isLast = stepIndex === steps.length - 1;

  // Card placement: below the target when asked or when room allows,
  // above otherwise; centered-card steps sit in the middle of the screen.
  let cardStyle: React.CSSProperties;
  if (!rect || !step?.target) {
    cardStyle = {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: cardW,
    };
  } else {
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const below =
      step.placement === "bottom"
        ? true
        : step.placement === "top"
          ? false
          : spaceBelow >= cardH + 24 || spaceBelow >= spaceAbove;
    const top = below ? rect.bottom + 14 : rect.top - 14 - cardH;
    const left = rect.left + rect.width / 2 - cardW / 2;
    cardStyle = {
      left: Math.max(12, Math.min(left, vw - cardW - 12)),
      top: Math.max(12, Math.min(top, vh - cardH - 12)),
      width: cardW,
    };
  }

  return createPortal(
    <>
      {/* Click-catcher — transparent; the dim comes from the ring's
          box-shadow so the target stays fully lit (true cutout).
          Centered steps get a plain dim instead (no ring). */}
      <div
        className="fixed inset-0 z-[80]"
        style={{
          backgroundColor: rect && step?.target ? "transparent" : "rgba(0,0,0,0.45)",
          touchAction: "none",
          transition: "background-color 0.18s ease",
        }}
        aria-hidden
      />

      {/* Spotlight ring — its shadow IS the dim layer. */}
      {rect && step?.target ? (
        <div
          className="pointer-events-none fixed z-[81]"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            borderRadius: 12,
            boxShadow:
              "0 0 0 2px var(--color-signal), 0 0 0 9999px rgba(0,0,0,0.5)",
            opacity: ready ? 1 : 0,
            transition:
              "top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease, opacity 0.18s ease",
          }}
          aria-hidden
        />
      ) : null}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={step?.title}
        className="fixed z-[82] rounded-[0.875rem] border p-3.5"
        style={{
          ...cardStyle,
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
          opacity: ready || !step?.target ? 1 : 0,
          transition:
            "top 0.22s ease, left 0.22s ease, opacity 0.18s ease, transform 0.22s ease",
        }}
      >
        {/* Step counter + dismiss */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-m-caption font-bold uppercase tracking-wide"
            style={{ color: "var(--color-signal-dark)" }}
          >
            {stepIndex + 1} of {steps.length}
          </span>
          <button
            onClick={skip}
            aria-label="Skip tour"
            className="press grid place-items-center size-7 rounded-[0.375rem]"
            style={{ color: "var(--color-ink-400)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <p
          className="text-m-section font-bold mb-1"
          style={{ color: "var(--color-ink-950)" }}
        >
          {step?.title}
        </p>
        <p
          className="text-m-body mb-3"
          style={{ color: "var(--color-ink-700)" }}
        >
          {step?.body}
        </p>

        <div className="flex gap-2">
          <button
            onClick={skip}
            className="flex-1 rounded-[0.625rem] border py-2 text-m-body font-semibold press"
            style={{
              borderColor: "var(--color-line)",
              color: "var(--color-ink-700)",
            }}
          >
            Skip
          </button>
          <button
            onClick={advance}
            className="flex-1 rounded-[0.625rem] py-2 text-m-body font-bold press flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {isLast ? (
              <>
                Done <Check className="size-4" />
              </>
            ) : (
              <>
                Next <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
