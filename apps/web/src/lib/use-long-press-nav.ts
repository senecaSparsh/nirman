"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

/**
 * useLongPressNav — long-press a button to navigate to a list page.
 *
 * Designed for the sticky bottom action bar on mobile form pages
 * (e.g. "Create Purchase Order" → long-press goes to /m/procurement).
 *
 * Returns:
 *   - `longPressProps`: spread on the <button> (pointer handlers + touch-action)
 *   - `wasLongPress()`: call in onClick to check if a long-press just fired;
 *     if true, suppress the normal click action
 *
 * Usage:
 *   const { longPressProps, wasLongPress } = useLongPressNav("/m/procurement");
 *   <button
 *     onClick={() => { if (wasLongPress()) return; handleSubmit(); }}
 *     {...longPressProps}
 *   >
 *     Create PO
 *   </button>
 */
export function useLongPressNav(href: string, label = "list") {
  const router = useRouter();
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    fired.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fired.current = true;
      haptic(50);
      toast.message(`Opening ${label}`, { duration: 1200 });
      router.push(href);
    }, 500);
  }, [href, label, router]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  const wasLongPress = useCallback(() => {
    if (fired.current) {
      fired.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    longPressProps: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      style: { touchAction: "none" as const },
      className: "select-none",
    },
    wasLongPress,
  };
}
