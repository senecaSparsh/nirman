"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
 * The redirect uses `window.location.replace()` (no history pollution)
 * and preserves query params and dynamic segments.
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
    desktopToMobile.set(desktopBase, r.path);
  } else if (r.kind !== "redirect") {
    // Fallback: strip /m prefix (e.g., "/m/materials" → "/materials")
    const desktop = r.path.slice(2); // "/m/materials" → "/materials"
    if (desktop && desktop !== "/") {
      mobileToDesktop.set(r.path, desktop);
      // Only add reverse mapping if no explicit one exists
      if (!desktopToMobile.has(desktop)) {
        desktopToMobile.set(desktop, r.path);
      }
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
  "/change-password", "/consent", "/api/", "/_next/", "/portal",
];
function shouldSkip(pathname: string): boolean {
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (pathname === "/favicon.ico" || /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/.test(pathname)) return true;
  return false;
}

// ── Check if a desktop path exists (either in manifest or as a known route) ──
function desktopRouteExists(path: string): boolean {
  const base = path.split("?")[0]!;
  // Check exact match
  if (ROUTE_BY_PATH.has(base)) return true;
  // Check if it could be a detail page (parent exists)
  const segments = base.split("/");
  // Try progressively shorter prefixes
  for (let i = segments.length; i > 1; i--) {
    const prefix = segments.slice(0, i).join("/");
    if (ROUTE_BY_PATH.has(prefix)) return true;
    // Check with [id] pattern
    const dynamicPrefix = [...segments.slice(0, i - 1), "[id]"].join("/");
    if (ROUTE_BY_PATH.has(dynamicPrefix)) return true;
  }
  return false;
}

// ── Check if a mobile path exists ──
function mobileRouteExists(path: string): boolean {
  const base = path.split("?")[0]!;
  if (ROUTE_BY_PATH.has(base)) return true;
  const segments = base.split("/");
  for (let i = segments.length; i > 1; i--) {
    const prefix = segments.slice(0, i).join("/");
    if (ROUTE_BY_PATH.has(prefix)) return true;
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
function resolveTarget(pathname: string, search: string, toMobile: boolean): string | null {
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
    if (entry?.parent) {
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
      return target;
    }

    // Fallback: strip /m prefix
    const desktopCandidate = pathname.slice(2); // "/m/materials" → "/materials"
    if (desktopCandidate && desktopRouteExists(desktopCandidate)) {
      return desktopCandidate + (search || "");
    }

    // Try parent-based mapping (for detail pages without desktopPath)
    if (entry.parent) {
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
function mapDynamicSegments(pathname: string, sourcePattern: string | undefined, targetPattern: string): string {
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
  const currentPath = pathname ?? "";
  const search = searchParams?.toString() ?? "";
  const isRedirecting = useRef(false);

  useEffect(() => {
    if (shouldSkip(currentPath)) return;
    if (isRedirecting.current) return;

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const isMobile = mql.matches;
    const onMobileRoute = currentPath.startsWith("/m");

    // Check if we need to redirect
    const needsRedirect =
      (isMobile && !onMobileRoute) || (!isMobile && onMobileRoute);

    if (!needsRedirect) return;

    const target = resolveTarget(currentPath, search ? `?${search}` : "", !isMobile);
    if (!target) return; // No equivalent on the other surface — stay

    // Instant redirect — replace() avoids history pollution
    isRedirecting.current = true;
    window.location.replace(target);
  }, [currentPath, search]);

  // Listen for viewport size changes (orientation, resize, window move)
  useEffect(() => {
    if (shouldSkip(currentPath)) return;

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = () => {
      if (isRedirecting.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);

      // Small debounce to avoid rapid redirects during drag-resize
      debounceTimer = setTimeout(() => {
        const isMobile = mql.matches;
        const onMobileRoute = currentPath.startsWith("/m");
        const needsRedirect =
          (isMobile && !onMobileRoute) || (!isMobile && onMobileRoute);

        if (!needsRedirect) return;

        const target = resolveTarget(currentPath, search ? `?${search}` : "", !isMobile);
        if (!target) return;

        isRedirecting.current = true;
        window.location.replace(target);
      }, 150);
    };

    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [currentPath, search]);

  // Reset the redirecting flag when the pathname changes (new page loaded)
  useEffect(() => {
    isRedirecting.current = false;
  }, [currentPath]);

  return null;
}
