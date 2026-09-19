"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveTarget, shouldSkip } from "@/lib/surface-map";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SURFACE ADAPTER — screen-size-based mobile/desktop routing
 *
 * Watches the viewport width and instantly redirects the user to the
 * correct surface (mobile `/m/*` or desktop `/*`) when the screen size
 * crosses the breakpoint. This ensures:
 *   · No mobile user ever sees the desktop version
 *   · No desktop user ever sees the mobile version
 *   · Adapts instantly on resize, orientation change, or window move
 *
 * BREAKPOINT: 1024px (same as the sign-in page's matchMedia check).
 * Below 1024px = mobile surface, above = desktop surface.
 *
 * The pure path-resolution logic lives in `lib/surface-map.ts` so the
 * middleware (server, UA-based) resolves through the exact same
 * manifest-aware mapping — see that file for the mapping rules.
 *
 * If a route has no equivalent on the other surface (e.g., `/m/site` is
 * mobile-only), the user stays on the current surface — no redirect.
 *
 * The redirect uses `router.replace()` (instant client-side navigation,
 * no full page reload) and preserves query params and dynamic segments.
 * ═══════════════════════════════════════════════════════════════════
 */

// Re-exported so existing imports (notification-bell, tests) keep working.
export {
  resolveTarget,
  shouldSkip,
  desktopRouteExists,
  mobileRouteExists,
  resolveLinkForSurface,
  mapDynamicSegments,
} from "@/lib/surface-map";

const MOBILE_BREAKPOINT = "(max-width: 1023px)";

// Same mobile-UA test as the middleware — used to scope the "view desktop"
// escape hatch to actual phones (a desktop window dragged narrow must still
// adapt; a phone that chose desktop should be respected).
const MOBILE_UA_RE = /Android(?:(?=.*Mobile)|(?=.*\bSilk\b))|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Mobile\b/i;

export function SurfaceAdapter() {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname ?? "";
  // Keep the latest path in a ref so the resize/matchMedia listeners always
  // read the live location — never a stale closure. Search params are read
  // from window.location inside the handler (no useSearchParams hook, so this
  // component never suspends and can mount outside the root Suspense boundary).
  const pathRef = useRef(currentPath);

  // ── Core redirect logic — idempotent, self-healing ──────────────────────
  // Guard is "don't re-issue the same navigation", not a sticky flag — so a
  // resize can never permanently block. The guard clears as soon as the path
  // changes (below), and `target === path` is a no-op.
  const lastIssued = useRef<string | null>(null);

  const checkAndRedirect = () => {
    const path = pathRef.current;
    if (!path || shouldSkip(path)) return;
    // "View desktop" escape hatch — only honored on a real mobile device. A
    // desktop browser resized to a narrow window must still adapt to mobile;
    // the cookie only exists to let a *phone* keep the desktop ERP view.
    if (MOBILE_UA_RE.test(navigator.userAgent) && document.cookie.includes("nirman-desktop=1")) return;

    const isMobile = window.matchMedia(MOBILE_BREAKPOINT).matches;
    const onMobileRoute = path.startsWith("/m/") || path === "/m";
    const needsRedirect =
      (isMobile && !onMobileRoute) || (!isMobile && onMobileRoute);
    if (!needsRedirect) {
      lastIssued.current = null;
      return;
    }

    const search = window.location.search || "";
    let target = resolveTarget(path, search, isMobile);
    // Desktop→mobile with no mapped equivalent → land on the mobile home so
    // the user is never stranded on a desktop page on a phone-width screen.
    if (!target && isMobile && !onMobileRoute) target = "/m/home" + search;
    if (!target || target === path) return;
    if (lastIssued.current === target) return; // already navigating there
    lastIssued.current = target;
    router.replace(target);
  };

  // Re-check whenever the path changes (and on mount). Reading currentPath as a
  // dep re-runs the check after each navigation so redirect chains settle.
  useEffect(() => {
    pathRef.current = currentPath;
    lastIssued.current = null; // new path → allow a fresh redirect
    checkAndRedirect();
    // Pre-paint surface guard: BOOT_SCRIPT marks <html> 'surface-pending'
    // when the viewport and route surface disagree, hiding the document
    // until we resolve. Reveal only when NO redirect is in flight — while
    // navigating, the arriving page's effect reveals the correct surface.
    if (!lastIssued.current) {
      document.documentElement.classList.remove("surface-pending");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  // Listen for viewport changes — matchMedia change fires on crossing the
  // breakpoint; resize is a debounced fallback for edge cases.
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const onChange = () => checkAndRedirect();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(checkAndRedirect, 120);
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
    } else {
      (mql as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(onChange);
    }
    window.addEventListener("resize", onResize);
    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onChange);
      } else {
        (mql as MediaQueryList & { removeListener: (cb: () => void) => void }).removeListener(onChange);
      }
      window.removeEventListener("resize", onResize);
      if (debounce) clearTimeout(debounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
