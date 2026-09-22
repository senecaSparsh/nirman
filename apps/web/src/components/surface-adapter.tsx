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
 * crosses the breakpoint. Combined with the CSS surface gates in
 * globals.css (`[data-surface]` media queries) this guarantees:
 *   · No mobile user ever sees the desktop version — not even a frame
 *   · No desktop user ever sees the mobile version — not even a frame
 *   · Adapts instantly on resize, orientation change, or window move
 * There is no escape hatch by design.
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
  // The "already navigating" guard is time-boxed, not sticky: if the issued
  // navigation fails transiently (server hiccup, aborted RSC fetch, a stale
  // middleware redirect) the path never changes — and a sticky guard would
  // leave the user stranded on the wrong surface forever. Re-issue the same
  // target after RETRY_MS; a successful navigation still short-circuits via
  // the path-change effect below.
  const RETRY_MS = 2500;
  const lastIssued = useRef<{ target: string; at: number } | null>(null);

  const checkAndRedirect = () => {
    const path = pathRef.current;
    if (!path || shouldSkip(path)) return;

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
    const last = lastIssued.current;
    if (last?.target === target && Date.now() - last.at < RETRY_MS) return;
    lastIssued.current = { target, at: Date.now() };
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

  // Retry loop: while a redirect is in flight (issued but path hasn't changed
  // yet — the nav may have failed transiently), keep re-checking so the user
  // never stays stranded on a hidden surface. checkAndRedirect's time-boxed
  // guard rate-limits the retries; it no-ops instantly once landed.
  useEffect(() => {
    const t = setInterval(() => {
      if (lastIssued.current) checkAndRedirect();
    }, RETRY_MS / 2);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
