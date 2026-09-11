"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { ROUTES, ROUTE_BY_PATH, matchRoute } from "@/lib/route-manifest";

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
 * ROUTE MAPPING:
 *   Mobile → Desktop: uses the route manifest's `desktopPath` field.
 *     Falls back to stripping the `/m` prefix.
 *   Desktop → Mobile: reverse mapping from `desktopPath` → mobile path.
 *     Falls back to adding the `/m` prefix.
 *
 * If a route has no equivalent on the other surface (e.g., `/m/site` is
 * mobile-only), the user stays on the current surface — no redirect.
 *
 * The redirect uses `router.replace()` (instant client-side navigation,
 * no full page reload) and preserves query params and dynamic segments.
 * ═══════════════════════════════════════════════════════════════════
 */

const MOBILE_BREAKPOINT = "(max-width: 1023px)";

// ── Build route mappings from the manifest ──────────────────────
// mobileToDesktop: "/m/materials" → "/materials"
// desktopToMobile: "/materials" → "/m/materials"
// Uses `desktopPath` when available, falls back to prefix swap.

const mobileToDesktop = new Map<string, string>();
const desktopToMobile = new Map<string, string>();

for (const r of ROUTES) {
  if (!r.path.startsWith("/m/")) continue;
  if (r.desktopPath) {
    // Explicit mapping (e.g., "/m/expense-claims" → "/finance?tab=claims")
    const desktopBase = r.desktopPath.split("?")[0]!;
    mobileToDesktop.set(r.path, r.desktopPath);
    // Don't overwrite an existing base mapping. When multiple mobile routes
    // share the same desktopPath base (e.g., /procurement, /procurement?tab=indents,
    // /procurement?tab=returns), the first one (the "hub" without query params)
    // should win for the reverse desktop→mobile mapping. Without this guard,
    // the last route in the manifest overwrites the correct base mapping.
    if (!desktopToMobile.has(desktopBase)) {
      desktopToMobile.set(desktopBase, r.path);
    }
  } else if (r.kind !== "redirect") {
    // Fallback: strip /m prefix (e.g., "/m/materials" → "/materials")
    // Only add FORWARD mapping (mobile→desktop). Don't add reverse mapping
    // (desktop→mobile) because we don't know if a desktop page actually
    // exists — stripping /m is just a guess. Reverse mappings should only
    // come from explicit desktopPath entries. The parent-based mapping
    // in resolveTarget handles detail pages via the parent's explicit map.
    const desktop = r.path.slice(2); // "/m/materials" → "/materials"
    if (desktop && desktop !== "/") {
      mobileToDesktop.set(r.path, desktop);
    }
  }
}

// Special cases
mobileToDesktop.set("/m", "/");
mobileToDesktop.set("/m/home", "/");
desktopToMobile.set("/", "/m/home");

// ── Routes that should never be redirected ──────────────────────
const SKIP_PREFIXES = [
  "/sign-in", "/sign-up", "/forgot-password", "/reset-password",
  "/change-password", "/consent", "/accept/", "/api/", "/_next/", "/portal", "/print",
];
export function shouldSkip(pathname: string): boolean {
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (pathname === "/favicon.ico" || /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/.test(pathname)) return true;
  return false;
}

// ── Check if a desktop path exists (either in manifest or as a known route) ──
// The manifest only has /m/* routes, so we also check the desktopToMobile
// map (which has desktop paths as keys from desktopPath mappings) and the
// mobileToDesktop map values (which are desktop paths).
export function desktopRouteExists(path: string): boolean {
  const base = path.split("?")[0]!;
  // Check if any mobile route maps TO this desktop path
  if (desktopToMobile.has(base)) return true;
  // Check exact match in manifest (catches /m/* routes that might be
  // passed here, though normally we only check desktop paths)
  if (ROUTE_BY_PATH.has(base)) return true;
  // Check if it could be a detail page (parent exists in the desktop mapping)
  const segments = base.split("/");
  for (let i = segments.length; i > 1; i--) {
    const prefix = segments.slice(0, i).join("/");
    if (desktopToMobile.has(prefix)) return true;
    // Skip redirect entries when checking parents — a redirect like "/"
    // or "/m" doesn't have real children. Only real pages (hub, list,
    // detail, create, edit) can have path children.
    const parentEntry = ROUTE_BY_PATH.get(prefix);
    if (parentEntry && parentEntry.kind !== "redirect") return true;
    // Check with [id] pattern
    const dynamicPrefix = [...segments.slice(0, i - 1), "[id]"].join("/");
    if (ROUTE_BY_PATH.has(dynamicPrefix)) return true;
  }
  return false;
}

// ── Check if a mobile path exists ──
export function mobileRouteExists(path: string): boolean {
  const base = path.split("?")[0]!;
  if (ROUTE_BY_PATH.has(base)) return true;
  const segments = base.split("/");
  for (let i = segments.length; i > 1; i--) {
    const prefix = segments.slice(0, i).join("/");
    // Skip redirect entries when checking parents — "/m" is a redirect
    // to "/m/home", so "/m/crews" should NOT match just because "/m"
    // exists. Only real pages (hub, list, detail, create, edit) can
    // have path children.
    const parentEntry = ROUTE_BY_PATH.get(prefix);
    if (parentEntry && parentEntry.kind !== "redirect") return true;
    const dynamicPrefix = [...segments.slice(0, i - 1), "[id]"].join("/");
    if (ROUTE_BY_PATH.has(dynamicPrefix)) return true;
  }
  return false;
}

/**
 * Resolve the target URL when switching surfaces.
 * Returns the target pathname (with query params) or null if no
 * equivalent exists on the other surface.
 */
export function resolveTarget(pathname: string, search: string, toMobile: boolean): string | null {
  if (toMobile) {
    // ── Desktop → Mobile ──
    if (pathname === "/" || pathname === "") return "/m/home" + (search || "");

    // Try reverse mapping (desktopPath → mobile path)
    const entry = matchRoute(pathname);
    if (entry?.path.startsWith("/m/")) {
      // Already on mobile — shouldn't happen, but guard
      return null;
    }

    // Check if the current path is a known desktop path with a mobile mapping
    const base = pathname.split("?")[0]!;
    if (desktopToMobile.has(base)) {
      const mobilePath = desktopToMobile.get(base)!;
      // Preserve dynamic segments
      const target = mapDynamicSegments(pathname, entry?.path, mobilePath);
      return target + (search || "");
    }

    // Fallback: add /m prefix
    const mobileCandidate = "/m" + base;
    if (mobileRouteExists(mobileCandidate)) {
      return mobileCandidate + (search || "");
    }

    // Try parent-based mapping (for detail pages)
    // Only applies when the pathname is a PATH CHILD of the parent (not just
    // a logical child in the manifest). E.g., /materials/abc is a path child
    // of /materials, but /procurement is NOT a path child of /hr.
    if (entry?.parent && base.startsWith(entry.parent + "/")) {
      const parentMobile = desktopToMobile.get(entry.parent);
      if (parentMobile) {
        // Replace the desktop parent with the mobile parent in the path
        const remaining = base.slice(entry.parent.length);
        return parentMobile + remaining + (search || "");
      }
    }

    return null;
  } else {
    // ── Mobile → Desktop ──
    if (pathname === "/m" || pathname === "/m/home") return "/" + (search || "");

    const entry = matchRoute(pathname);
    if (!entry?.path.startsWith("/m/")) {
      // Already on desktop — shouldn't happen, but guard
      return null;
    }

    // Check explicit desktopPath mapping
    if (entry.desktopPath) {
      // Preserve dynamic segments if the route has them
      const target = mapDynamicSegments(pathname, entry.path, entry.desktopPath);
      // Append search params if the desktopPath doesn't already have query params.
      // If desktopPath has its own query (e.g., "/finance?tab=claims"), don't
      // append the current search — the desktop route's query takes priority.
      if (search && !entry.desktopPath.includes("?")) {
        return target + search;
      }
      return target;
    }

    // Fallback: strip /m prefix
    const desktopCandidate = pathname.slice(2); // "/m/materials" → "/materials"
    if (desktopCandidate && desktopRouteExists(desktopCandidate)) {
      return desktopCandidate + (search || "");
    }

    // Try parent-based mapping (for detail pages without desktopPath)
    // Only applies when the pathname is a PATH CHILD of the parent.
    if (entry.parent && pathname.startsWith(entry.parent + "/")) {
      const parentDesktop = mobileToDesktop.get(entry.parent);
      if (parentDesktop) {
        const parentBase = parentDesktop.split("?")[0]!;
        const remaining = pathname.slice(entry.parent.length);
        const target = parentBase + remaining;
        if (desktopRouteExists(target)) {
          return target + (search || "");
        }
      }
    }

    return null;
  }
}

/**
 * Map dynamic segments from the source path to the target path pattern.
 * e.g., pathname="/m/materials/abc123", sourcePattern="/m/materials/[id]",
 *       targetPattern="/materials" → "/materials/abc123"
 */
export function mapDynamicSegments(pathname: string, sourcePattern: string | undefined, targetPattern: string): string {
  if (!sourcePattern || !sourcePattern.includes("[")) {
    // No dynamic segments in source — return target as-is
    return targetPattern;
  }

  // Split both into segments
  const pathSegs = pathname.split("/").filter(Boolean);
  const sourceSegs = sourcePattern.split("/").filter(Boolean);

  // Extract dynamic segment values from the pathname
  const dynamicValues: string[] = [];
  for (let i = 0; i < sourceSegs.length && i < pathSegs.length; i++) {
    if (sourceSegs[i]!.startsWith("[")) {
      dynamicValues.push(pathSegs[i]!);
    }
  }

  // Replace [xxx] in the target pattern with the actual values
  const targetSegs = targetPattern.split("/").filter(Boolean);
  let dynIdx = 0;
  const resultSegs = targetSegs.map((seg) => {
    if (seg.startsWith("[") && dynIdx < dynamicValues.length) {
      return dynamicValues[dynIdx++]!;
    }
    return seg;
  });

  // If the target has fewer segments than the source (e.g., target is a list
  // page but source is a detail page), append the remaining dynamic segments
  while (dynIdx < dynamicValues.length) {
    resultSegs.push(dynamicValues[dynIdx++]!);
  }

  return "/" + resultSegs.join("/");
}

export function SurfaceAdapter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentPath = pathname ?? "";
  const search = searchParams?.toString() ?? "";
  const isRedirecting = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Core redirect logic (shared by mount + change listeners) ──
  // Uses router.replace() for instant client-side navigation — no full
  // page reload, no re-downloading JS, no re-hydrating React, no losing
  // SWR cache. The transition is effectively instant.
  const attemptRedirect = (path: string, searchStr: string) => {
    if (shouldSkip(path)) return;
    if (isRedirecting.current) return;

    // Respect the "View desktop" escape-hatch cookie. The middleware sets
    // this when the user visits ?desktop=1. If it's present, the user
    // explicitly chose desktop — don't fight them.
    if (document.cookie.includes("nirman-desktop=1")) return;

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const isMobile = mql.matches;
    const onMobileRoute = path.startsWith("/m/") || path === "/m";

    const needsRedirect =
      (isMobile && !onMobileRoute) || (!isMobile && onMobileRoute);
    if (!needsRedirect) return;

    // resolveTarget(pathname, search, toMobile):
    //   toMobile=true  → desktop→mobile mapping
    //   toMobile=false → mobile→desktop mapping
    // When isMobile=true (narrow), we're going TO mobile → toMobile=true.
    // When isMobile=false (wide), we're going TO desktop → toMobile=false.
    // So the third arg is simply `isMobile` (not `!isMobile`).
    const target = resolveTarget(path, searchStr || "", isMobile);
    if (!target) {
      // No direct mobile equivalent. For desktop→mobile, fall back to
      // /m/home so the user always lands on the mobile surface instead
      // of being stuck on a desktop page on a phone screen.
      if (isMobile && !onMobileRoute) {
        isRedirecting.current = true;
        if (resetTimer.current) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => { isRedirecting.current = false; }, 1500);
        router.replace("/m/home");
        return;
      }
      return; // Mobile→desktop with no equivalent — stay on mobile
    }

    isRedirecting.current = true;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => { isRedirecting.current = false; }, 1500);
    router.replace(target);
  };

  // ── 1. Check on mount and when the path changes ──────────────
  useEffect(() => {
    attemptRedirect(currentPath, search ? `?${search}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, search]);

  // ── 2. Listen for viewport size changes ──────────────────────
  // Primary: matchMedia change event (fires when crossing the breakpoint).
  // Fallback: resize event (fires on every pixel change — debounced).
  // The resize fallback catches edge cases where matchMedia change
  // doesn't fire (rare browser bugs, certain DevTools workflows).
  useEffect(() => {
    if (shouldSkip(currentPath)) return;

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;

    // matchMedia change fires ONCE when crossing the breakpoint — no
    // debounce needed, redirect immediately for instant response.
    const handleMediaChange = () => {
      attemptRedirect(currentPath, search ? `?${search}` : "");
    };

    // resize fires on EVERY pixel change during drag — debounce to avoid
    // spamming router.replace() while the user is still dragging.
    const handleResize = () => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        attemptRedirect(currentPath, search ? `?${search}` : "");
      }, 100);
    };

    // Safari < 14 uses the legacy addListener/removeListener API.
    const supportsAddEventListener = typeof mql.addEventListener === "function";
    if (supportsAddEventListener) {
      mql.addEventListener("change", handleMediaChange);
    } else {
      (mql as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(handleMediaChange);
    }
    window.addEventListener("resize", handleResize);
    return () => {
      if (supportsAddEventListener) {
        mql.removeEventListener("change", handleMediaChange);
      } else {
        (mql as MediaQueryList & { removeListener: (cb: () => void) => void }).removeListener(handleMediaChange);
      }
      window.removeEventListener("resize", handleResize);
      if (resizeDebounce) clearTimeout(resizeDebounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, search]);

  // ── 3. Reset the redirecting flag when the pathname changes ──
  useEffect(() => {
    isRedirecting.current = false;
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, [currentPath]);

  return null;
}
