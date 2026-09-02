"use client";

import * as React from "react";

/**
 * useAutoScroll — slowly auto-scrolls a horizontal overflow container.
 *
 * - Pauses while the user interacts (touch / drag / wheel / pointer-down)
 *   and resumes after `resumeMs` of idle.
 * - Loops back to the start when it reaches the end (with a brief pause).
 * - Respects `prefers-reduced-motion` (no auto-scroll).
 * - No-ops when there's no overflow (content fits).
 * - Pauses when the tab is hidden to save battery.
 *
 * @returns a ref to attach to the scrollable element.
 */
export function useAutoScroll<T extends HTMLElement>(
  deps: React.DependencyList,
  { pxPerFrame = 0.4, resumeMs = 2500, endPauseMs = 1500 } = {},
) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const hasOverflow = () => el.scrollWidth - el.clientWidth > 4;
    // Wait a tick for layout, then bail if nothing overflows.
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled || !hasOverflow()) return;
      start();
    });
    if (!hasOverflow()) {
      // Still try after layout settles via the rAF above.
    }

    let rafId = 0;
    const pausedRef = { current: false };
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const pauseTemporarily = () => {
      pausedRef.current = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        pausedRef.current = false;
      }, resumeMs);
    };

    const stopPermanently = () => {
      pausedRef.current = true;
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    };

    const tick = () => {
      if (!pausedRef.current) {
        const max = el.scrollWidth - el.clientWidth;
        if (max > 0) {
          let next = el.scrollLeft + pxPerFrame;
          if (next >= max) {
            next = 0;
            pausedRef.current = true;
            if (resumeTimer) clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => {
              pausedRef.current = false;
            }, endPauseMs);
          }
          el.scrollLeft = next;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      rafId = requestAnimationFrame(tick);
      el.addEventListener("touchstart", pauseTemporarily, { passive: true });
      el.addEventListener("touchmove", pauseTemporarily, { passive: true });
      el.addEventListener("wheel", pauseTemporarily, { passive: true });
      el.addEventListener("pointerdown", pauseTemporarily, { passive: true });
    };

    const onVisibility = () =>
      document.hidden ? stopPermanently() : pauseTemporarily();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (resumeTimer) clearTimeout(resumeTimer);
      el.removeEventListener("touchstart", pauseTemporarily);
      el.removeEventListener("touchmove", pauseTemporarily);
      el.removeEventListener("wheel", pauseTemporarily);
      el.removeEventListener("pointerdown", pauseTemporarily);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
