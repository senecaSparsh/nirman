"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { smartBack } from "@/lib/mobile-nav";

/**
 * Back button + hook that tries `router.back()` first, and falls back to a
 * logical parent URL if `router.back()` doesn't actually navigate (no
 * history entry to go back to — deep link, refresh, external referral).
 *
 * Detection is done via the `popstate` event: if `router.back()` navigates,
 * the browser fires `popstate` synchronously. If it doesn't fire within
 * 150ms, `router.back()` was a no-op and we use the fallback.
 *
 * This requires no state tracking — it works correctly regardless of how
 * the user arrived at the current page.
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
    smartBack(
      () => router.back(),
      () => {
        if (fallback) {
          router.push(fallback);
        }
      },
    );
  }, [router, fallback]);
}
