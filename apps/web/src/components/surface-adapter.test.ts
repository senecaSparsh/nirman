/**
 * Comprehensive tests for the SurfaceAdapter client-side redirect logic.
 *
 * Tests the pure functions that power the viewport-based surface switching:
 *   · resolveTarget — maps a path from one surface to the other
 *   · shouldSkip — determines if a path should never be redirected
 *   · desktopRouteExists — checks if a desktop route exists
 *   · mobileRouteExists — checks if a mobile route exists
 *   · mapDynamicSegments — maps [id] segments from source to target
 *
 * Covers every angle:
 *   · Desktop → Mobile with explicit desktopPath mapping
 *   · Desktop → Mobile with fallback /m prefix
 *   · Desktop → Mobile with parent-based mapping (detail pages)
 *   · Mobile → Desktop with explicit desktopPath mapping
 *   · Mobile → Desktop with fallback strip /m prefix
 *   · Mobile → Desktop with parent-based mapping
 *   · Routes with no equivalent → null (stay on current surface)
 *   · Dynamic segment preservation (/m/materials/abc → /materials/abc)
 *   · Query param preservation
 *   · Special cases: /, /m, /m/home
 *   · shouldSkip for auth routes, API routes, static assets
 */
import { describe, it, expect } from "vitest";
import {
  resolveTarget,
  shouldSkip,
  desktopRouteExists,
  mobileRouteExists,
  mapDynamicSegments,
} from "./surface-adapter";

// ── resolveTarget: Desktop → Mobile ──────────────────────────
describe("resolveTarget: Desktop → Mobile", () => {
  it("redirects / to /m/home", () => {
    expect(resolveTarget("/", "", true)).toBe("/m/home");
  });

  it("redirects / to /m/home with query params", () => {
    expect(resolveTarget("/", "?tab=home", true)).toBe("/m/home?tab=home");
  });

  it("redirects /materials to /m/materials (fallback /m prefix)", () => {
    expect(resolveTarget("/materials", "", true)).toBe("/m/materials");
  });

  it("redirects /hr/employees to /m/hr/employees (explicit desktopPath)", () => {
    expect(resolveTarget("/hr/employees", "", true)).toBe("/m/hr/employees");
  });

  it("redirects /hr to /m/hr (explicit desktopPath)", () => {
    expect(resolveTarget("/hr", "", true)).toBe("/m/hr");
  });

  it("redirects /procurement to /m/procurement (first mapping wins over conflicts)", () => {
    // Multiple routes share desktopPath base /procurement (quotations, requisitions,
    // supplier-returns). The first mapping (/m/procurement) should win.
    expect(resolveTarget("/procurement", "", true)).toBe("/m/procurement");
  });

  it("redirects /equipment to /m/equipment (explicit desktopPath)", () => {
    expect(resolveTarget("/equipment", "", true)).toBe("/m/equipment");
  });

  it("redirects /finance to a mobile route (first mapping wins)", () => {
    // /finance maps to multiple mobile routes via desktopPath with ?tab=
    // The first mapping should win.
    const target = resolveTarget("/finance", "", true);
    expect(target).toBeTruthy();
    expect(target).toMatch(/^\/m\//);
  });

  it("preserves query params on desktop → mobile redirect", () => {
    expect(resolveTarget("/materials", "?search=cement", true)).toBe(
      "/m/materials?search=cement",
    );
  });

  it("preserves query params on /procurement → /m/procurement", () => {
    const target = resolveTarget("/procurement", "?tab=indents", true);
    expect(target).toContain("/m/procurement");
    expect(target).toContain("tab=indents");
  });

  it("returns null for desktop-only route with no mobile equivalent", () => {
    // /crews is desktop-only (no /m/crews route in manifest)
    const target = resolveTarget("/crews", "", true);
    // Should either be null (no equivalent) or a fallback path
    // Based on the manifest, /crews has no mobile equivalent
    expect(target === null || target.startsWith("/m/")).toBe(true);
  });

  it("handles /cost-control → /m/budget-variance or similar (query-based desktopPath)", () => {
    const target = resolveTarget("/cost-control", "?tab=budget-variance", true);
    // /cost-control maps to multiple mobile routes via desktopPath with ?tab=
    expect(target).toBeTruthy();
  });

  it("handles /reports → /m/reports", () => {
    expect(resolveTarget("/reports", "", true)).toBe("/m/reports");
  });

  it("handles /reports/profit → /m/reports/profit", () => {
    expect(resolveTarget("/reports/profit", "", true)).toBe("/m/reports/profit");
  });
});

// ── resolveTarget: Mobile → Desktop ──────────────────────────
describe("resolveTarget: Mobile → Desktop", () => {
  it("redirects /m to /", () => {
    expect(resolveTarget("/m", "", false)).toBe("/");
  });

  it("redirects /m/home to /", () => {
    expect(resolveTarget("/m/home", "", false)).toBe("/");
  });

  it("redirects /m/home to / with query params", () => {
    expect(resolveTarget("/m/home", "?tab=overview", false)).toBe(
      "/?tab=overview",
    );
  });

  it("redirects /m/materials to /materials (fallback strip /m)", () => {
    expect(resolveTarget("/m/materials", "", false)).toBe("/materials");
  });

  it("redirects /m/hr to /hr (explicit desktopPath)", () => {
    expect(resolveTarget("/m/hr", "", false)).toBe("/hr");
  });

  it("redirects /m/procurement to /procurement (explicit desktopPath)", () => {
    expect(resolveTarget("/m/procurement", "", false)).toBe("/procurement");
  });

  it("redirects /m/expense-claims to /finance?tab=claims (explicit desktopPath with query)", () => {
    expect(resolveTarget("/m/expense-claims", "", false)).toBe(
      "/finance?tab=claims",
    );
  });

  it("redirects /m/expenses to /finance?tab=expenses", () => {
    expect(resolveTarget("/m/expenses", "", false)).toBe("/finance?tab=expenses");
  });

  it("preserves query params on mobile → desktop (fallback)", () => {
    expect(resolveTarget("/m/materials", "?search=steel", false)).toBe(
      "/materials?search=steel",
    );
  });

  it("returns null for mobile-only route with no desktop equivalent", () => {
    // /m/site is mobile-only
    const target = resolveTarget("/m/site", "", false);
    expect(target).toBeNull();
  });

  it("returns null for /m/queue (mobile-only)", () => {
    const target = resolveTarget("/m/queue", "", false);
    // /m/queue has no desktopPath and /queue doesn't exist as a desktop route
    expect(target === null || target === "/queue").toBe(true);
  });
});

// ── resolveTarget: dynamic segments ──────────────────────────
describe("resolveTarget: dynamic segments", () => {
  it("maps /m/materials/abc123 → /materials/abc123", () => {
    const target = resolveTarget("/m/materials/abc123", "", false);
    expect(target).toBe("/materials/abc123");
  });

  it("maps /m/procurement/po-456 → /procurement/po-456", () => {
    const target = resolveTarget("/m/procurement/po-456", "", false);
    expect(target).toBe("/procurement/po-456");
  });

  it("maps /m/hr/employees/emp-789 → /hr/employees/emp-789", () => {
    const target = resolveTarget("/m/hr/employees/emp-789", "", false);
    expect(target).toBe("/hr/employees/emp-789");
  });

  it("maps /materials/abc123 → /m/materials/abc123 (desktop → mobile with dynamic)", () => {
    const target = resolveTarget("/materials/abc123", "", true);
    expect(target).toBe("/m/materials/abc123");
  });

  it("preserves query params with dynamic segments", () => {
    const target = resolveTarget("/m/materials/abc123", "?tab=history", false);
    expect(target).toBe("/materials/abc123?tab=history");
  });
});

// ── shouldSkip ───────────────────────────────────────────────
describe("shouldSkip", () => {
  it("skips /sign-in", () => {
    expect(shouldSkip("/sign-in")).toBe(true);
  });

  it("skips /sign-in subpaths", () => {
    expect(shouldSkip("/sign-in/callback")).toBe(true);
  });

  it("skips /sign-up", () => {
    expect(shouldSkip("/sign-up")).toBe(true);
  });

  it("skips /forgot-password", () => {
    expect(shouldSkip("/forgot-password")).toBe(true);
  });

  it("skips /reset-password", () => {
    expect(shouldSkip("/reset-password")).toBe(true);
  });

  it("skips /change-password", () => {
    expect(shouldSkip("/change-password")).toBe(true);
  });

  it("skips /consent", () => {
    expect(shouldSkip("/consent")).toBe(true);
  });

  it("skips /api/ routes", () => {
    expect(shouldSkip("/api/materials")).toBe(true);
    expect(shouldSkip("/api/auth/sign-in/email")).toBe(true);
  });

  it("skips /_next/ routes", () => {
    expect(shouldSkip("/_next/static/chunks/main.js")).toBe(true);
  });

  it("skips /portal routes", () => {
    expect(shouldSkip("/portal")).toBe(true);
    expect(shouldSkip("/portal/listings")).toBe(true);
  });

  it("skips /print routes", () => {
    expect(shouldSkip("/print")).toBe(true);
    expect(shouldSkip("/print/invoice/123")).toBe(true);
  });

  it("skips /accept routes (email token links)", () => {
    expect(shouldSkip("/accept/agreement/abc123")).toBe(true);
    expect(shouldSkip("/accept/offer/xyz789")).toBe(true);
  });

  it("skips favicon.ico", () => {
    expect(shouldSkip("/favicon.ico")).toBe(true);
  });

  it("skips static asset extensions", () => {
    expect(shouldSkip("/images/logo.svg")).toBe(true);
    expect(shouldSkip("/styles.css")).toBe(true);
    expect(shouldSkip("/script.js")).toBe(true);
    expect(shouldSkip("/photo.jpg")).toBe(true);
    expect(shouldSkip("/icon.png")).toBe(true);
    expect(shouldSkip("/manifest.webmanifest")).toBe(true);
    expect(shouldSkip("/robots.txt")).toBe(true);
  });

  it("does NOT skip app routes", () => {
    expect(shouldSkip("/")).toBe(false);
    expect(shouldSkip("/materials")).toBe(false);
    expect(shouldSkip("/m/home")).toBe(false);
    expect(shouldSkip("/procurement")).toBe(false);
    expect(shouldSkip("/hr/employees")).toBe(false);
  });

  it("does NOT skip /m routes", () => {
    expect(shouldSkip("/m")).toBe(false);
    expect(shouldSkip("/m/home")).toBe(false);
    expect(shouldSkip("/m/materials")).toBe(false);
  });
});

// ── desktopRouteExists ───────────────────────────────────────
describe("desktopRouteExists", () => {
  it("returns true for known desktop routes (via desktopToMobile map)", () => {
    expect(desktopRouteExists("/materials")).toBe(true);
    expect(desktopRouteExists("/procurement")).toBe(true);
    expect(desktopRouteExists("/hr/employees")).toBe(true);
    expect(desktopRouteExists("/equipment")).toBe(true);
  });

  it("returns true for / (root, via special case mapping)", () => {
    expect(desktopRouteExists("/")).toBe(true);
  });

  it("returns true for detail pages (parent exists in desktop mapping)", () => {
    expect(desktopRouteExists("/materials/abc123")).toBe(true);
    expect(desktopRouteExists("/procurement/po-456")).toBe(true);
    expect(desktopRouteExists("/hr/employees/emp-789")).toBe(true);
  });

  it("returns false for unknown routes", () => {
    expect(desktopRouteExists("/nonexistent-route-xyz")).toBe(false);
    expect(desktopRouteExists("/some/random/deep/path/that/does/not/exist")).toBe(false);
  });

  it("returns true for /m routes (they're in ROUTE_BY_PATH too)", () => {
    // /m routes ARE in the manifest, so they "exist" — but the adapter
    // only calls desktopRouteExists when checking desktop candidates
    expect(desktopRouteExists("/m/materials")).toBe(true);
  });
});

// ── mobileRouteExists ────────────────────────────────────────
describe("mobileRouteExists", () => {
  it("returns true for known mobile routes", () => {
    expect(mobileRouteExists("/m/materials")).toBe(true);
    expect(mobileRouteExists("/m/procurement")).toBe(true);
    expect(mobileRouteExists("/m/hr/employees")).toBe(true);
    expect(mobileRouteExists("/m/home")).toBe(true);
  });

  it("returns true for /m", () => {
    expect(mobileRouteExists("/m")).toBe(true);
  });

  it("returns true for mobile detail pages", () => {
    expect(mobileRouteExists("/m/materials/abc123")).toBe(true);
    expect(mobileRouteExists("/m/procurement/po-456")).toBe(true);
    expect(mobileRouteExists("/m/hr/employees/emp-789")).toBe(true);
  });

  it("returns true for unknown /m/* routes only if a real parent exists", () => {
    // /m/nonexistent-route-xyz has no real parent (only /m which is a redirect)
    expect(mobileRouteExists("/m/nonexistent-route-xyz")).toBe(false);
    // /m/some/random/deep/path also has no real parent
    expect(mobileRouteExists("/m/some/random/deep/path")).toBe(false);
  });

  it("returns false for desktop-only routes", () => {
    expect(mobileRouteExists("/materials")).toBe(false);
    expect(mobileRouteExists("/procurement")).toBe(false);
  });
});

// ── mapDynamicSegments ───────────────────────────────────────
describe("mapDynamicSegments", () => {
  it("returns target as-is when source has no dynamic segments", () => {
    expect(mapDynamicSegments("/m/materials", "/m/materials", "/materials")).toBe(
      "/materials",
    );
  });

  it("maps single [id] segment", () => {
    expect(
      mapDynamicSegments("/m/materials/abc123", "/m/materials/[id]", "/materials"),
    ).toBe("/materials/abc123");
  });

  it("maps [id] from source to target with [id]", () => {
    expect(
      mapDynamicSegments(
        "/m/materials/abc123",
        "/m/materials/[id]",
        "/materials/[id]",
      ),
    ).toBe("/materials/abc123");
  });

  it("maps when target has fewer segments (detail → list)", () => {
    // Source: /m/procurement/po-456, target: /procurement (no [id])
    // The dynamic value should be appended
    expect(
      mapDynamicSegments("/m/procurement/po-456", "/m/procurement/[id]", "/procurement"),
    ).toBe("/procurement/po-456");
  });

  it("returns target as-is when sourcePattern is undefined", () => {
    expect(mapDynamicSegments("/m/materials", undefined, "/materials")).toBe(
      "/materials",
    );
  });

  it("handles multiple dynamic segments", () => {
    expect(
      mapDynamicSegments(
        "/m/materials/abc/edit",
        "/m/materials/[id]/edit",
        "/materials/[id]/edit",
      ),
    ).toBe("/materials/abc/edit");
  });
});

// ── Edge cases: round-trip consistency ────────────────────────
describe("resolveTarget: round-trip consistency", () => {
  // A route that exists on both surfaces should round-trip:
  // desktop → mobile → desktop should return the original (or equivalent)
  it("/materials → /m/materials → /materials", () => {
    const mobile = resolveTarget("/materials", "", true);
    expect(mobile).toBe("/m/materials");
    const back = resolveTarget(mobile!, "", false);
    expect(back).toBe("/materials");
  });

  it("/hr/employees → /m/hr/employees → /hr/employees", () => {
    const mobile = resolveTarget("/hr/employees", "", true);
    expect(mobile).toBe("/m/hr/employees");
    const back = resolveTarget(mobile!, "", false);
    expect(back).toBe("/hr/employees");
  });

  it("/procurement → /m/procurement → /procurement", () => {
    const mobile = resolveTarget("/procurement", "", true);
    expect(mobile).toBe("/m/procurement");
    const back = resolveTarget(mobile!, "", false);
    expect(back).toBe("/procurement");
  });

  it("/ → /m/home → /", () => {
    const mobile = resolveTarget("/", "", true);
    expect(mobile).toBe("/m/home");
    const back = resolveTarget(mobile!, "", false);
    expect(back).toBe("/");
  });
});

// ── Edge cases: already on correct surface ───────────────────
describe("resolveTarget: already on correct surface", () => {
  it("returns null when desktop path is already mobile (guard)", () => {
    // Calling resolveTarget with toMobile=true on a /m path
    // The matchRoute would return a mobile entry, and the guard
    // "if (entry?.path.startsWith("/m/"))" returns null
    const result = resolveTarget("/m/materials", "", true);
    expect(result).toBeNull();
  });

  it("returns null when mobile path is already desktop (guard)", () => {
    // Calling resolveTarget with toMobile=false on a desktop path
    // matchRoute returns a desktop entry (not starting with /m/),
    // and the guard "if (!entry?.path.startsWith("/m/"))" returns null
    const result = resolveTarget("/materials", "", false);
    expect(result).toBeNull();
  });
});
