import { ROUTES, ROUTE_BY_PATH, matchRoute } from "@/lib/route-manifest";
import { DESKTOP_ROUTES } from "@/lib/desktop-routes";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SURFACE MAP — pure path-resolution between desktop and mobile routes.
 *
 * Shared by:
 *   · `components/surface-adapter.tsx` (client, viewport-width based)
 *   · `middleware.ts` (server, user-agent based — the flash-prevention
 *     redirect that runs before hydration)
 *
 * Both layers MUST resolve through the same manifest-aware mapping or a
 * mobile user lands on a path that does not exist (e.g. the sign-in
 * redirect sent SITE_ENGINEER to `/hr/dprs`; a blind `/m` prefix produces
 * `/m/hr/dprs` → 404, while the manifest maps it to `/m/dprs`).
 *
 * ROUTE MAPPING:
 *   Mobile → Desktop: uses the route manifest's `desktopPath` field.
 *     Falls back to stripping the `/m` prefix.
 *   Desktop → Mobile: reverse mapping from `desktopPath` → mobile path.
 *     Falls back to adding the `/m` prefix — only when the candidate
 *     mobile route actually exists.
 *
 * If a route has no equivalent on the other surface (e.g., `/m/site` is
 * mobile-only), resolution returns null — the caller decides the
 * fallback (client: stay put / `/m/home`; middleware: `/m/home`).
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
  // Print-style routes outside /print/* (e.g. /sales/[id]/print) — documents
  // must render in place; there is no /m equivalent to redirect to.
  if (pathname.endsWith("/print")) return true;
  if (pathname === "/favicon.ico" || /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/.test(pathname)) return true;
  return false;
}

// ── Check if a desktop path exists ──
// DESKTOP_ROUTES is the authoritative registry (kept in sync with app/* by
// the route-manifest tests). A declared desktopPath mapping also counts —
// it is an explicit contract that the desktop page exists.
export function desktopRouteExists(path: string): boolean {
  const base = path.split("?")[0]!;
  if (DESKTOP_ROUTES.has(base)) return true;
  // Dynamic-route match: /hr/employees/abc → /hr/employees/[id]
  const segments = base.split("/");
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.startsWith("[")) continue;
    const dyn = [...segments.slice(0, i), "[id]", ...segments.slice(i + 1)].join("/");
    if (DESKTOP_ROUTES.has(dyn)) return true;
  }
  // Declared mapping (desktopPath values not yet in the registry)
  if (desktopToMobile.has(base)) return true;
  if (ROUTE_BY_PATH.has(base)) return true;
  return false;
}

/** Longest existing desktop ancestor of `path` ("" when none). */
export function nearestDesktopAncestor(path: string): string | null {
  const base = path.split("?")[0]!;
  const segments = base.split("/").filter(Boolean);
  for (let i = segments.length - 1; i > 0; i--) {
    const prefix = "/" + segments.slice(0, i).join("/");
    if (desktopRouteExists(prefix)) return prefix;
  }
  return null;
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
    // The candidate is a mobile-only page under a real desktop parent —
    // land on the nearest existing desktop ancestor instead of a 404.
    if (desktopCandidate) {
      const ancestor = nearestDesktopAncestor(desktopCandidate);
      if (ancestor) return ancestor + (search || "");
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
 * Resolve a stored entity link to the surface the user is currently on.
 *
 * Notification links (bell + push) are stored as MOBILE paths (`/m/...`) so a
 * phone never lands on a desktop page. On desktop the stored `/m/...` link is
 * converted to its desktop equivalent via the same mapping the adapter uses,
 * so the desktop bell keeps working. On mobile the link is returned as-is.
 *
 * Falls back to the raw link when there's no mapping (e.g. a mobile-only or
 * desktop-only route) — never returns a desktop path to a mobile viewport.
 */
export function resolveLinkForSurface(link: string | null): string | null {
  if (!link) return null;
  if (typeof window === "undefined") return link;
  const isMobile = window.matchMedia(MOBILE_BREAKPOINT).matches;
  if (isMobile) return link; // already mobile-native
  // Desktop: convert the stored /m/... link to its desktop route.
  const q = link.indexOf("?");
  const pathname = q === -1 ? link : link.slice(0, q);
  const search = q === -1 ? "" : link.slice(q);
  return resolveTarget(pathname, search, false) ?? link;
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

  // Replace [xxx] in the target pattern with the actual values. Extra dynamic
  // values are DROPPED when the target is a list page — the declared
  // desktopPath is authoritative, and appending invents child routes that
  // don't exist ("/m/leads/abc" must land on "/leads", not "/leads/abc" → 404).
  const targetSegs = targetPattern.split("/").filter(Boolean);
  let dynIdx = 0;
  const resultSegs = targetSegs.map((seg) => {
    if (seg.startsWith("[") && dynIdx < dynamicValues.length) {
      return dynamicValues[dynIdx++]!;
    }
    return seg;
  });

  return "/" + resultSegs.join("/");
}
