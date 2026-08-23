"use client";

import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";

/**
 * Swipe action hook — for mobile list items.
 *
 * Reveals action buttons when the user swipes left on a list item.
 * The actions slide in from the right edge. Tapping an action fires
 * the callback; tapping elsewhere snaps the item back.
 *
 * Note: swipe-to-go-back on detail pages is already handled globally
 * by the MobileShellV2 (edge-swipe from left edge → router.back()).
 * This hook is for inline list-item actions only.
 *
 * Usage:
 *   const { offset, bind, actionWidth, close } = useSwipeAction({
 *     actions: [
 *       { label: "Approve", color: "#16a34a", onPress: () => approve() },
 *       { label: "Reject", color: "#ef4444", onPress: () => reject() },
 *     ],
 *   });
 *   <div className="relative overflow-hidden">
 *     <div style={{ transform: `translateX(${offset}px)` }} {...bind}>
 *       {item content}
 *     </div>
 *     <div className="absolute right-0 top-0 bottom-0 flex">
 *       {actions.map(a => <button style={{ width: actionWidth, backgroundColor: a.color }}>{a.label}</button>)}
 *     </div>
 *   </div>
 */

export interface SwipeAction {
  label: string;
  color: string;
  textColor?: string;
  onPress: () => void;
}

export function useSwipeAction({
  actions,
  maxSwipe = 160,
}: {
  actions: SwipeAction[];
  maxSwipe?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const horizontal = useRef<boolean | null>(null);

  const actionWidth = Math.min(maxSwipe / actions.length, 80);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    swiping.current = true;
    horizontal.current = null;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!swiping.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // Determine direction on first significant movement
      if (horizontal.current === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        horizontal.current = Math.abs(dx) > Math.abs(dy);
      }

      if (!horizontal.current) return;

      // Allow swipe left to reveal, swipe right to close
      const base = open ? -actionWidth * actions.length : 0;
      const newOffset = Math.max(-maxSwipe, Math.min(0, base + dx));
      setOffset(newOffset);
    },
    [open, actionWidth, actions.length, maxSwipe],
  );

  const handleTouchEnd = useCallback(() => {
    if (!swiping.current) return;
    swiping.current = false;
    horizontal.current = null;

    const revealWidth = actionWidth * actions.length;
    if (offset < -revealWidth / 2) {
      setOffset(-revealWidth);
      setOpen(true);
      haptic(10);
    } else {
      setOffset(0);
      setOpen(false);
    }
  }, [offset, actionWidth, actions.length]);

  const close = useCallback(() => {
    setOffset(0);
    setOpen(false);
  }, []);

  return {
    offset,
    open,
    actionWidth,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    close,
  };
}

