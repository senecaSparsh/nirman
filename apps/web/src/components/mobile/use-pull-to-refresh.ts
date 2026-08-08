"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Pull-to-refresh hook — the native mobile gesture.
 *
 * Attach the returned `bind` to the scrollable container. When the user
 * pulls down at the top of the scroll area (past a threshold), `onRefresh`
 * fires. A spinner indicator shows during the pull and during the refresh.
 *
 * Why a hook, not a component: the scroll container is `<main>` in
 * MobileShell, and different pages have different refresh logic. The hook
 * lets each page own its refresh without wrapping its DOM.
 *
 * Disables itself on non-touch devices (desktop preview) so it never
 * interferes with desktop scrolling.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const THRESHOLD = 60;
  const MAX_PULL = 90;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start tracking if the scroll area is at the top
    const target = e.currentTarget as HTMLElement;
    const touch = e.touches[0];
    if (target.scrollTop <= 0 && touch) {
      startY.current = touch.clientY;
      pulling.current = true;
    } else {
      pulling.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - startY.current;
    if (delta > 0) {
      // Dampen the pull so it feels like resistance, not free scrolling
      const damped = Math.min(delta * 0.5, MAX_PULL);
      setPullDistance(damped);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    // Reset state if the component unmounts mid-pull
    return () => {
      pulling.current = false;
    };
  }, []);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 0 || refreshing;

  return {
    pullDistance,
    refreshing,
    progress,
    showIndicator,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
