"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { arrivedInternally } from "@/lib/mobile-nav";

/**
 * Back button + hook that navigates to the actual previous page in browser
 * history when the user arrived via an in-app (client-side) navigation, and
 * falls back to a logical parent URL when they didn't (deep link, refresh,
 * external referral).
 *
 * This replaces the previous `window.history.length <= 1` heuristic, which was
 * unreliable: `history.length` counts ALL session entries (including forward
 * ones), so a deep-link from WhatsApp/SMS (length=2) would call `router.back()`
 * and navigate the user OUT of the app to a blank page, while a forward-then-
 * back navigation would loop the user forward.
 *
 * The arrival signal is maintained by {@link NavigationTracker} (mounted in the
 * mobile layout) via a sessionStorage flag set on client-side route changes and
 * cleared on full page loads. See `src/lib/mobile-nav.ts`.
 *
 * Use {@link MobileBackButton} for the standard chevron back button, or
 * {@link useMobileBack} when you need the same logic inside an existing button
 * (e.g. a form's Cancel button that also handles an `onClose` dialog branch).
 */
export function MobileBackButton({
  fallback,
  className,
  style,
  size = "size-5",
}: {
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: string;
}) {
  const goBack = useMobileBack(fallback);

  return (
    <button
      onClick={goBack}
      aria-label="Go back"
      className={`flex items-center press active:scale-95 ${className ?? ""}`}
      style={style}
    >
      <ChevronLeft className={size} />
    </button>
  );
}

/**
 * Hook returning a back-navigation handler that uses the same smart-back +
 * safe-fallback logic as {@link MobileBackButton}. Use this when you need to
 * compose the behavior into an existing button (e.g. one that also closes a
 * dialog via `onClose`):
 *
 * ```tsx
 * const goBack = useMobileBack("/m/leads");
 * <button onClick={() => (onClose ? onClose() : goBack())}>…</button>
 * ```
 */
export function useMobileBack(fallback?: string): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (arrivedInternally()) {
      router.back();
    } else if (fallback) {
      router.push(fallback);
    } else {
      // No fallback provided — best-effort back(). On a deep link with no
      // history this is a no-op, but at least it won't navigate out of the app
      // (arrivedInternally() already returned false for external referrals).
      router.back();
    }
  }, [router, fallback]);
}
