/**
 * Comprehensive tests for the middleware redirect behavior (server-side).
 *
 * Covers every angle of the mobile/desktop surface selection:
 *   · Landing page ("/") with mobile UA → /m
 *   · Landing page ("/") with desktop UA → no redirect
 *   · Deep routes with mobile UA → /m + path
 *   · Deep routes with desktop UA → no redirect
 *   · ?desktop=1 sets escape-hatch cookie + redirects to /
 *   · ?mobile=1 clears escape-hatch cookie + redirects to /m
 *   · nirman-desktop cookie overrides mobile detection
 *   · /m routes never reverse-redirected to desktop
 *   · Public routes (/sign-in, /api/auth/*) never redirected
 *   · API routes never redirected
 *   · /print and /portal routes never redirected
 *   · Query params preserved on redirect
 *   · Auth cookie check redirects to /sign-in when missing
 *   · Auth cookie present → no auth redirect
 *   · AUTH_BYPASS=true skips auth gate
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware, isPublicRoute } from "./middleware";

// ── Helpers ──────────────────────────────────────────────────
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const BASE = "http://localhost:3000";

function makeReq(
  path: string,
  opts: {
    ua?: string;
    cookie?: string;
    method?: string;
  } = {},
): NextRequest {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {};
  if (opts.ua !== undefined) headers["user-agent"] = opts.ua;
  else headers["user-agent"] = DESKTOP_UA;
  if (opts.cookie) headers["cookie"] = opts.cookie;

  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
  });
}

function getRedirectLocation(res: NextResponse): string | null {
  return res.headers.get("location");
}

function getSetCookie(res: NextResponse): string | null {
  return res.headers.get("set-cookie");
}

// ── Setup: save and restore env vars ─────────────────────────
const ORIG_AUTH_BYPASS = process.env.AUTH_BYPASS;
const ORIG_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // Default to AUTH_BYPASS=true so the auth gate doesn't interfere
  // with redirect tests. Individual tests override as needed.
  process.env.AUTH_BYPASS = "true";
  (process.env as Record<string, string>).NODE_ENV = "development";
});

afterEach(() => {
  process.env.AUTH_BYPASS = ORIG_AUTH_BYPASS;
  (process.env as Record<string, string>).NODE_ENV = ORIG_NODE_ENV ?? "development";
});

// ── Tests ────────────────────────────────────────────────────
describe("Middleware: landing page redirect", () => {
  it("mobile UA on / → redirects to /m", () => {
    const res = middleware(makeReq("/", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
  });

  it("desktop UA on / → no redirect (passes through)", () => {
    const res = middleware(makeReq("/", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("mobile UA on / with nirman-desktop cookie → no redirect", () => {
    const res = middleware(
      makeReq("/", { ua: MOBILE_UA, cookie: "nirman-desktop=1" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("empty UA on / → no redirect (treated as desktop)", () => {
    const res = middleware(makeReq("/", { ua: "" }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: deep route redirect (mobile UA)", () => {
  it("mobile UA on /materials → redirects to /m/materials", () => {
    const res = middleware(makeReq("/materials", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/materials`);
  });

  it("mobile UA on /hr/employees → redirects to /m/hr/employees", () => {
    const res = middleware(makeReq("/hr/employees", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/hr/employees`);
  });

  it("mobile UA on /procurement?tab=indents → redirects to /m/procurement?tab=indents", () => {
    const res = middleware(makeReq("/procurement?tab=indents", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res);
    expect(loc).toContain("/m/procurement");
    expect(loc).toContain("tab=indents");
  });

  it("desktop UA on /materials → no redirect", () => {
    const res = middleware(makeReq("/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("mobile UA on /materials with nirman-desktop cookie → no redirect", () => {
    const res = middleware(
      makeReq("/materials", { ua: MOBILE_UA, cookie: "nirman-desktop=1" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: /m routes never reverse-redirected", () => {
  it("desktop UA on /m → no redirect to /", () => {
    const res = middleware(makeReq("/m", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("desktop UA on /m/home → no redirect", () => {
    const res = middleware(makeReq("/m/home", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("desktop UA on /m/materials → no redirect", () => {
    const res = middleware(makeReq("/m/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("mobile UA on /m/home → no redirect (already on mobile)", () => {
    const res = middleware(makeReq("/m/home", { ua: MOBILE_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: ?desktop=1 escape hatch", () => {
  it("sets nirman-desktop cookie and redirects to /", () => {
    const res = middleware(makeReq("/?desktop=1", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/`);
    const cookie = getSetCookie(res);
    expect(cookie).toContain("nirman-desktop=1");
  });

  it("works from a deep route", () => {
    const res = middleware(makeReq("/materials?desktop=1", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/`);
    expect(getSetCookie(res)).toContain("nirman-desktop=1");
  });

  it("works with desktop UA too (no harm)", () => {
    const res = middleware(makeReq("/?desktop=1", { ua: DESKTOP_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/`);
    expect(getSetCookie(res)).toContain("nirman-desktop=1");
  });
});

describe("Middleware: ?mobile=1 clears escape hatch", () => {
  it("clears nirman-desktop cookie and redirects to /m", () => {
    const res = middleware(
      makeReq("/?mobile=1", { ua: DESKTOP_UA, cookie: "nirman-desktop=1" }),
    );
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
    // The cookie should be deleted (set with empty value or expiry in past)
    const cookie = getSetCookie(res);
    expect(cookie).toBeTruthy();
    // NextResponse.cookies.delete() sets the cookie to empty with Max-Age=0
    expect(cookie).toContain("nirman-desktop");
  });

  it("works from a deep route", () => {
    const res = middleware(
      makeReq("/materials?mobile=1", { ua: DESKTOP_UA, cookie: "nirman-desktop=1" }),
    );
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
  });

  it("works even without the cookie already set", () => {
    const res = middleware(makeReq("/?mobile=1", { ua: DESKTOP_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
  });
});

describe("Middleware: public routes never redirected", () => {
  it("/sign-in with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/sign-in", { ua: MOBILE_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/sign-up with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/sign-up", { ua: MOBILE_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/forgot-password with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/forgot-password", { ua: MOBILE_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/api/auth/sign-in/email with mobile UA → no mobile redirect", () => {
    const res = middleware(
      makeReq("/api/auth/sign-in/email", { ua: MOBILE_UA, method: "POST" }),
    );
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/_next/static/chunks/main.js with mobile UA → no redirect", () => {
    const res = middleware(makeReq("/_next/static/chunks/main.js", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/favicon.ico with mobile UA → no redirect", () => {
    const res = middleware(makeReq("/favicon.ico", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: /print and /portal routes never redirected", () => {
  it("/print/invoice/123 with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/print/invoice/123", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/portal with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/portal", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/portal/listings with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/portal/listings", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: /accept routes (email token links) never redirected", () => {
  it("/accept/agreement/[token] with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/accept/agreement/abc123", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/accept/offer/[token] with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/accept/offer/xyz789", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/accept/agreement/[token] is a public route (no auth required)", () => {
    expect(isPublicRoute("/accept/agreement/abc123")).toBe(true);
  });

  it("/accept/offer/[token] is a public route (no auth required)", () => {
    expect(isPublicRoute("/accept/offer/xyz789")).toBe(true);
  });
});

describe("Middleware: API routes never mobile-redirected", () => {
  it("/api/materials with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/api/materials", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/api/procurement with mobile UA → no mobile redirect", () => {
    const res = middleware(makeReq("/api/procurement", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: query params preserved on redirect", () => {
  it("preserves single query param on deep route redirect", () => {
    const res = middleware(makeReq("/procurement?tab=quotes", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("/m/procurement");
    expect(loc).toContain("tab=quotes");
  });

  it("preserves multiple query params on deep route redirect", () => {
    const res = middleware(
      makeReq("/procurement?tab=indents&status=open", { ua: MOBILE_UA }),
    );
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("tab=indents");
    expect(loc).toContain("status=open");
  });
});

describe("Middleware: auth gate (no AUTH_BYPASS)", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS = "false";
  });

  it("redirects to /sign-in when no session cookie", () => {
    const res = middleware(makeReq("/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("/sign-in");
    expect(loc).toContain("redirect=%2Fmaterials");
  });

  it("preserves /m as redirect target for mobile UA on /", () => {
    const res = middleware(makeReq("/", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    // Mobile UA on / → first redirect to /m (landing redirect),
    // but since no session cookie, the auth gate fires FIRST.
    // Actually the landing redirect fires before auth gate, so this
    // should redirect to /m. Then /m would hit the auth gate.
    // Let's check: the landing redirect is at line 200, auth at 260+.
    // The landing redirect fires first.
    const loc = getRedirectLocation(res)!;
    expect(loc).toBe(`${BASE}/m`);
  });

  it("does not redirect when session cookie present", () => {
    const res = middleware(
      makeReq("/materials", {
        ua: DESKTOP_UA,
        cookie: "better-auth.session_token=abc123",
      }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("does not redirect /sign-in even without session", () => {
    const res = middleware(makeReq("/sign-in", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("does not redirect /api/* routes (they return 401 JSON)", () => {
    const res = middleware(makeReq("/api/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });
});

describe("Middleware: AUTH_BYPASS=true skips auth gate", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
  });

  it("no session cookie needed — passes through", () => {
    const res = middleware(makeReq("/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("still does mobile redirect even with AUTH_BYPASS", () => {
    const res = middleware(makeReq("/materials", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/materials`);
  });
});

describe("Middleware: AUTH_BYPASS in production is ignored", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS = "true";
    (process.env as Record<string, string>).NODE_ENV = "production";
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = ORIG_NODE_ENV ?? "development";
  });

  it("auth gate still active in production even with AUTH_BYPASS=true", () => {
    const res = middleware(makeReq("/materials", { ua: DESKTOP_UA }));
    // Should redirect to /sign-in (auth gate active)
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toContain("/sign-in");
  });
});

// ── Production-specific tests (NODE_ENV=production, no AUTH_BYPASS) ──
// These tests verify the mobile redirect works correctly in production
// where the auth gate is active. The mobile redirect must fire BEFORE
// the auth gate so mobile users never see a flash of desktop content.
describe("Middleware: production mode (auth gate active)", () => {
  beforeEach(() => {
    process.env.AUTH_BYPASS = "false";
    (process.env as Record<string, string>).NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.AUTH_BYPASS = "true";
    (process.env as Record<string, string>).NODE_ENV = ORIG_NODE_ENV ?? "development";
  });

  // ── Mobile redirect fires BEFORE auth gate ──
  it("mobile UA on / → mobile redirect to /m (fires BEFORE auth gate)", () => {
    const res = middleware(makeReq("/", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
  });

  it("mobile UA on /materials → mobile redirect to /m/materials (BEFORE auth gate)", () => {
    const res = middleware(makeReq("/materials", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/materials`);
  });

  it("mobile UA on /me → mobile redirect to /m/me (BEFORE auth gate)", () => {
    const res = middleware(makeReq("/me", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/me`);
  });

  it("mobile UA on /measurement-book → mobile redirect (BEFORE auth gate)", () => {
    const res = middleware(makeReq("/measurement-book", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/measurement-book`);
  });

  // ── Auth gate fires on /m routes (after mobile redirect) ──
  it("/m (no session) → auth redirect to /sign-in?redirect=%2Fm", () => {
    const res = middleware(makeReq("/m", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("/sign-in");
    expect(loc).toContain("redirect=%2Fm");
  });

  it("/m/materials (no session) → auth redirect with /m/materials as target", () => {
    const res = middleware(makeReq("/m/materials", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("/sign-in");
    expect(loc).toContain("redirect=%2Fm%2Fmaterials");
  });

  // ── Desktop UA without session → auth redirect ──
  it("desktop UA on / (no session) → auth redirect to /sign-in", () => {
    const res = middleware(makeReq("/", { ua: DESKTOP_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toContain("/sign-in");
    expect(getRedirectLocation(res)).toContain("redirect=%2F");
  });

  it("desktop UA on /materials (no session) → auth redirect", () => {
    const res = middleware(makeReq("/materials", { ua: DESKTOP_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toContain("/sign-in");
    expect(getRedirectLocation(res)).toContain("redirect=%2Fmaterials");
  });

  // ── Session cookie variants ──
  it("dev session cookie (better-auth.session_token) passes auth gate", () => {
    const res = middleware(
      makeReq("/materials", { ua: DESKTOP_UA, cookie: "better-auth.session_token=fake-session" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("production session cookie (__Secure-better-auth.session_token) passes auth gate", () => {
    const res = middleware(
      makeReq("/materials", { ua: DESKTOP_UA, cookie: "__Secure-better-auth.session_token=fake-session" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("dev .sig cookie variant passes auth gate", () => {
    const res = middleware(
      makeReq("/materials", { ua: DESKTOP_UA, cookie: "better-auth.session_token.sig=fake-sig" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("production .sig cookie variant passes auth gate", () => {
    const res = middleware(
      makeReq("/materials", { ua: DESKTOP_UA, cookie: "__Secure-better-auth.session_token.sig=fake-sig" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  // ── Mobile redirect + session cookie ──
  it("mobile UA + session cookie on /materials → mobile redirect (not auth)", () => {
    const res = middleware(
      makeReq("/materials", { ua: MOBILE_UA, cookie: "better-auth.session_token=fake" }),
    );
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m/materials`);
  });

  it("mobile UA + session cookie on /m/materials → 200 (already mobile + authed)", () => {
    const res = middleware(
      makeReq("/m/materials", { ua: MOBILE_UA, cookie: "better-auth.session_token=fake" }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  // ── Escape hatch in production ──
  it("?desktop=1 sets cookie + redirects to / (production)", () => {
    const res = middleware(makeReq("/?desktop=1", { ua: MOBILE_UA }));
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/`);
    expect(getSetCookie(res)).toContain("nirman-desktop=1");
  });

  it("?mobile=1 clears cookie + redirects to /m (production)", () => {
    const res = middleware(
      makeReq("/?mobile=1", { ua: DESKTOP_UA, cookie: "nirman-desktop=1" }),
    );
    expect(res.status).toBe(307);
    expect(getRedirectLocation(res)).toBe(`${BASE}/m`);
    expect(getSetCookie(res)).toContain("nirman-desktop");
  });

  it("nirman-desktop cookie + mobile UA + session → no mobile redirect", () => {
    const res = middleware(
      makeReq("/materials", {
        ua: MOBILE_UA,
        cookie: "better-auth.session_token=fake; nirman-desktop=1",
      }),
    );
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  // ── Public routes in production ──
  it("/sign-in → 200 (public route, no auth check)", () => {
    const res = middleware(makeReq("/sign-in", { ua: MOBILE_UA }));
    expect(res.status).toBe(200);
    expect(getRedirectLocation(res)).toBeNull();
  });

  it("/api/materials → passes through (API route, no auth redirect)", () => {
    const res = middleware(makeReq("/api/materials", { ua: MOBILE_UA }));
    expect(getRedirectLocation(res)).toBeNull();
  });

  // ── Query params preserved in production ──
  it("query params preserved on mobile redirect (production)", () => {
    const res = middleware(
      makeReq("/procurement?tab=indents", { ua: MOBILE_UA, cookie: "better-auth.session_token=fake" }),
    );
    expect(res.status).toBe(307);
    const loc = getRedirectLocation(res)!;
    expect(loc).toContain("/m/procurement");
    expect(loc).toContain("tab=indents");
  });
});
