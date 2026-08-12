"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Smartphone, Monitor } from "lucide-react";
import { PERSONAS } from "@/lib/mobile-nav";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSIVE SURFACE REDIRECTOR
 *
 * The app has two distinct UI surfaces on two route trees:
 *   · desktop  →  /, /materials, /gl, …           (AppShell, rail+panel)
 *   · mobile   →  /m, /m/site, /m/books, …        (MobileShell, tab bar)
 *
 * Initial-load routing is handled server-side: `middleware.ts` redirects
 * a mobile User-Agent at ANY desktop route to `/m`, and the sign-in page
 * checks `matchMedia` once after login. Neither of those responds to the
 * viewport *changing* after load — resizing a window narrow, or rotating
 * a tablet, left you stuck on the wrong surface.
 *
 * This component closes that gap. It watches `matchMedia("(max-width:
 * 1023px)")` and auto-redirects to the correct surface on any mismatch:
 *
 *   1. HOME ROUTE (/ or a persona home like /m/site) → instant redirect.
 *      No context is lost at a home/list root, so the swap is safe.
 *   2. DEEP ROUTE (a form, a detail drawer, a ledger drill-down) → show
 *      a brief toast ("Switching to mobile/desktop view…") and redirect
 *      after 2 seconds. This gives the user a moment to mentally prepare
 *      for the surface switch, but still enforces the screen-size rule.
 *      The user can dismiss the toast to stay on the current surface
 *      (e.g. if they're mid-entry and need to finish first).
 *
 * It honours the existing `nirman-desktop=1` cookie (the "View desktop
 * site" escape hatch): if set, mobile is never forced, so a phone user
 * who explicitly chose desktop stays there.
 *
 * Resize events are debounced (250ms) so a drag doesn't fire a storm of
 * evaluations. The toast fires at most once per (mismatch-state, route)
 * pair, so repeated resize drags on the same deep page don't spam.
 * ═══════════════════════════════════════════════════════════════════
 */

const MOBILE_BREAKPOINT = "(max-width: 1023px)";
const DESKTOP_HOME = "/";
const DEEP_ROUTE_REDIRECT_DELAY = 2000;

/** Routes where auto-redirect is safe — home/list roots only. */
const MOBILE_HOMES = new Set<string>([
  "/m",
  ...Object.values(PERSONAS).map((p) => p.home),
]);

function isMobileSurface(pathname: string): boolean {
  return pathname === "/m" || pathname.startsWith("/m/");
}

function isHomeRoute(pathname: string): boolean {
  if (pathname === DESKTOP_HOME) return true;
  return MOBILE_HOMES.has(pathname);
}

function hasDesktopOverride(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|; )nirman-desktop=1/.test(document.cookie);
}

export function ResponsiveSurfaceRedirector() {
  const pathname = usePathname();
  const router = useRouter();
  // The last (mismatch, route) key we prompted for — prevents re-toasting
  // on every resize tick while the user stays on the same deep page.
  const lastPromptKey = useRef<string>("");
  // Track the pending redirect timer so we can cancel it if the user
  // dismisses the toast or the mismatch resolves.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Bare routes (sign-in, print) must not run surface logic — same
    // exclusion as AppShell, kept here so this component is self-contained.
    if (
      pathname === "/sign-in" ||
      pathname.startsWith("/sign-in/") ||
      pathname === "/print" ||
      pathname.startsWith("/print/")
    ) {
      return;
    }

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearRedirectTimer() {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
        redirectTimer.current = undefined;
      }
    }

    function evaluate() {
      const wantMobile = !hasDesktopOverride() && mql.matches;
      const onMobile = isMobileSurface(pathname);
      if (wantMobile === onMobile) {
        lastPromptKey.current = "";
        clearRedirectTimer();
        return;
      }

      const target = wantMobile ? "/m" : DESKTOP_HOME;

      // Safe to swap instantly at home/list roots — nothing in progress.
      if (isHomeRoute(pathname)) {
        clearRedirectTimer();
        router.replace(target);
        return;
      }

      // Deep route: show a toast and auto-redirect after a short delay.
      // The user can dismiss the toast to cancel the redirect (e.g. if
      // they're mid-entry on a form and need to finish first).
      const key = `${wantMobile ? "m" : "d"}:${pathname}`;
      if (lastPromptKey.current === key) return;
      lastPromptKey.current = key;

      const surfaceLabel = wantMobile ? "mobile" : "desktop";
      const Icon = wantMobile ? Smartphone : Monitor;

      clearRedirectTimer();
      redirectTimer.current = setTimeout(() => {
        router.replace(target);
      }, DEEP_ROUTE_REDIRECT_DELAY);

      toast(`Switching to ${surfaceLabel} view…`, {
        description: `You're on a ${mql.matches ? "narrow" : "wide"} screen.`,
        icon: <Icon className="h-4 w-4" />,
        duration: DEEP_ROUTE_REDIRECT_DELAY,
        dismissible: true,
        action: {
          label: "Stay here",
          onClick: () => {
            clearRedirectTimer();
            // Mark as prompted so we don't re-toast on the same route.
            // The user explicitly chose to stay — respect that until
            // they navigate or the screen size changes again.
          },
        },
        onDismiss: () => {
          clearRedirectTimer();
        },
      });
    }

    function onChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(evaluate, 250);
    }

    // Evaluate on mount and whenever the route changes.
    evaluate();
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      if (timer) clearTimeout(timer);
      clearRedirectTimer();
    };
  }, [pathname, router]);

  return null;
}
