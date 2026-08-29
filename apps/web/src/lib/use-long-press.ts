"use client";

import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";

/**
 * useLongPress — detects a long-press (hold for ≥500ms) on touch and mouse.
 *
 * Returns `bind` handlers to spread on any element. On long-press, fires
 * `onLongPress` with the coordinates (for positioning a menu).
 *
 * Movement > 10px cancels the press (so scrolling doesn't trigger it).
 */
export function useLongPress(onLongPress: (x: number, y: number) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);

  const start = useCallback(
    (x: number, y: number) => {
      startX.current = x;
      startY.current = y;
      fired.current = false;
      setPressing(true);
      timer.current = setTimeout(() => {
        fired.current = true;
        haptic(50);
        onLongPress(x, y);
        setPressing(false);
      }, ms);
    },
    [onLongPress, ms],
  );

  const move = useCallback((x: number, y: number) => {
    const dx = Math.abs(x - startX.current);
    const dy = Math.abs(y - startY.current);
    if (dx > 10 || dy > 10) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setPressing(false);
    }
  }, []);

  const end = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  }, []);

  return {
    pressing,
    bind: {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      },
      onTouchEnd: end,
      onTouchCancel: end,
      onMouseDown: (e: React.MouseEvent) => start(e.clientX, e.clientY),
      onMouseMove: (e: React.MouseEvent) => move(e.clientX, e.clientY),
      onMouseUp: end,
      onMouseLeave: end,
    },
  };
}
