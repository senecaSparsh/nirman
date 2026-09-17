"use client";

import { Compass, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { TOUR_START_EVENT } from "@/components/mobile/v2/product-tour";

/**
 * Settings → App zone row that replays the product tour. Dispatches the
 * "nirman:start-tour" event that <ProductTour> (mounted in the shell,
 * which persists across /m navigations) listens for — no query params,
 * no remount. The tour's first step navigates to the persona's hub on
 * its own, so the row works from any page.
 */
export function TourReplayRow() {
  return (
    <button
      type="button"
      onClick={() => {
        haptic.light();
        window.dispatchEvent(new Event(TOUR_START_EVENT));
      }}
      className="w-full flex items-center gap-2.5 rounded-[0.5rem] border px-3 py-2.5 text-m-body press text-left"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <Compass className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
          App tour
        </p>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Replay the 60-second walkthrough of the essentials
        </p>
      </div>
      <ChevronRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
    </button>
  );
}
