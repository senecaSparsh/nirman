"use client";

import { useEffect, useState } from "react";

/**
 * `true` while the user is scrolling down through content, `false` as soon
 * as they scroll back up or return near the top — the iOS Safari toolbar
 * behaviour. Floating buttons use it to get out of the way of the rows
 * they'd otherwise cover, and come back the moment the user reverses.
 *
 * Listens in the capture phase on `document` because the mobile shell
 * scrolls an inner container, not the window, and `scroll` doesn't bubble.
 * Each scroller's last position is tracked separately so a horizontal chip
 * strip or a nested list can't flip the state.
 */
export function useHideOnScroll({ threshold = 12, topZone = 48 } = {}): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const lastY = new WeakMap<EventTarget, number>();

    const onScroll = (e: Event) => {
      const target = e.target;
      if (!target) return;
      const y =
        target === document || target === document.documentElement
          ? window.scrollY
          : (target as Element).scrollTop;
      const prev = lastY.get(target);
      if (prev === undefined) {
        lastY.set(target, y);
        return;
      }
      if (y < topZone) {
        lastY.set(target, y);
        setHidden(false);
        return;
      }
      const delta = y - prev;
      // Accumulate small moves until they cross the threshold so a slow,
      // deliberate scroll still counts, but jitter doesn't.
      if (Math.abs(delta) < threshold) return;
      lastY.set(target, y);
      setHidden(delta > 0);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [threshold, topZone]);

  return hidden;
}
