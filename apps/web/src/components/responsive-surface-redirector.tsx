"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PERSONAS } from "@/lib/mobile-nav";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSIVE SURFACE REDIRECTOR (client-side complement to middleware)
 *
 * The app has two distinct UI surfaces on two route trees:
 *   · desktop  →  /, /materials, /gl, …           (AppShell, rail+panel)
 *   · mobile   →  /m, /m/site, /m/books, …        (MobileShell, tab bar)
 *
 * Surface selection is HYBRID:
 *   1. Server-side (middleware): mobile UA hitting "/" → 302 to "/m"
 *      before any HTML is sent. This eliminates the flash-of-desktop.
 *   2. Client-side (this component): handles the reverse case ("/m" on
 *      a wide screen → "/") and the resize case (narrow desktop window
 *      → "/m"). These are edge cases where the UA heuristic was wrong
 *      or the viewport changed after load.
 *
 * Deep routes (e.g. /materials, /m/material-sales/new) are NEVER
 * redirected. If you're on a mobile form and resize wide, you stay on
 * the mobile form. If you're on a desktop detail page and resize narrow,
 * you stay on the desktop page (which is responsive via the drawer).
 * This prevents losing in-progress work to a surface swap, and respects
 * explicit navigation — if a user deliberately visits a mobile URL on a
 * desktop screen, they stay there.
 *
 * It honours the `nirman-desktop=1` cookie (the "View desktop site"
 * escape hatch): if set, mobile is never forced, so a phone user who
 * explicitly chose desktop stays there.
 * ═══════════════════════════════════════════════════════════════════
 */

const MOBILE_BREAKPOINT = "(max-width: 1023px)";
const DESKTOP_HOME = "/";
const MOBILE_HOME = "/m";

/** Routes where auto-redirect is safe — home/list roots only. */
const MOBILE_HOMES = new Set<string>([
  MOBILE_HOME,
  ...Object.values(PERSONAS).map((p) => p.home),
]);

function isMobileSurface(pathname: string): boolean {
  return pathname === MOBILE_HOME || pathname.startsWith("/m/");
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

  useEffect(() => {
    // Bare routes (sign-in, print) must not run surface logic.
    if (
      pathname === "/sign-in" ||
      pathname.startsWith("/sign-in/") ||
      pathname === "/print" ||
      pathname.startsWith("/print/")
    ) {
      return;
    }

    const mql = window.matchMedia(MOBILE_BREAKPOINT);

    function evaluate() {
      const wantMobile = !hasDesktopOverride() && mql.matches;
      const onMobile = isMobileSurface(pathname);

      // Already on the correct surface — nothing to do.
      if (wantMobile === onMobile) return;

      // Only redirect from home routes. Deep routes stay where they are
      // — the user explicitly navigated there and may have in-progress
      // work. The desktop surface is responsive (has a mobile drawer),
      // so a narrow window on a desktop deep route is still usable.
      if (!isHomeRoute(pathname)) return;

      const target = wantMobile ? MOBILE_HOME : DESKTOP_HOME;
      router.replace(target);
    }

    function onChange() {
      evaluate();
    }

    // Evaluate on mount and whenever the route changes.
    evaluate();
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, [pathname, router]);

  return null;
}
