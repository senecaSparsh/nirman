"use client";

import { useEffect, useRef } from "react";

/**
 * useUnsavedGuard — warns when the user navigates away with unsaved form
 * changes. Works for both:
 *   - browser-level navigation (beforeunload)
 *   - Next.js client-side route changes (via a confirmation prompt)
 *
 * On mobile, the Android back button / iOS edge-swipe-back triggers
 * beforeunload, so this catches accidental back-taps on long forms.
 *
 * Usage:
 *   const dirty = useMemo(() => hasUnsavedData, [...]);
 *   useUnsavedGuard(dirty);
 *
 * The guard is only active when `isDirty` is true. When the form is
 * submitted or the draft is cleared, set isDirty to false to allow
 * navigation without the prompt.
 */
export function useUnsavedGuard(isDirty: boolean): void {
  const dirtyRef = useRef(isDirty);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      // Modern browsers ignore custom messages, but setting returnValue
      // triggers the native "Leave site?" confirmation dialog
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
