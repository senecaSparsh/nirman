"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Back button that navigates to the actual previous page in browser history
 * (via router.back()), instead of a hardcoded URL.
 *
 * Use this in place of `<Link href="/m/...">` back chevrons so that users
 * return to wherever they came from (list page, attention page, deep link, etc.)
 * rather than always landing on a fixed module home.
 *
 * Falls back to a given `fallback` href if there's no history (e.g. deep-linked
 * directly to the page). If no fallback is provided, defaults to router.back()
 * which is a no-op when there's no history.
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
  const router = useRouter();

  const handleBack = () => {
    // If there's no previous page in history (e.g. user opened a deep link
    // directly), fall back to the provided href.
    if (fallback && typeof window !== "undefined" && window.history.length <= 1) {
      router.push(fallback);
    } else {
      router.back();
    }
  };

  return (
    <button
      onClick={handleBack}
      aria-label="Back"
      className={`flex items-center press active:scale-95 ${className ?? ""}`}
      style={style}
    >
      <ChevronLeft className={size} />
    </button>
  );
}
