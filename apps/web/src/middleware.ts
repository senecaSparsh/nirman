import { NextRequest, NextResponse } from "next/server";

/**
 * Auth + surface-selection middleware.
 *
 * SURFACE SELECTION (mobile vs desktop):
 * The primary redirect is done HERE (server-side, UA-based) for the home
 * route "/" only — this eliminates the flash-of-desktop-content that a
 * purely client-side redirect causes on mobile devices. The
 * ResponsiveSurfaceRedirector component still handles the reverse case
 * (desktop user resizing narrow) and the `/m` → `/` case client-side via
 * matchMedia.
 *
 * Rules:
 *   · "/" + mobile UA + no desktop cookie  →  302 to "/m"  (server-side)
 *   · "/m" + desktop UA                     →  handled client-side (resize)
 *   · Deep routes are never redirected — explicit navigation is respected.
 *   · "nirman-desktop=1" cookie overrides mobile detection (escape hatch).
 *
 * Auth (all environments): checks for the better-auth session cookie. If
 * missing, redirects to /sign-in. Set AUTH_BYPASS=true to skip the cookie
 * check entirely (getSession() then returns a synthetic dev user) — useful
 * for headless local dev where you don't want to sign in.
 *
 * Public routes (always accessible, no cookie check):
 *   - /sign-in
 *   - /api/auth/*  (better-auth's own endpoints, incl. /api/auth/demo-login)
 *   - Static assets (_next/*, favicon, images)
 */

// ── Mobile UA detection ─────────────────────────────────────
// Matches phones (iPhone, Android phones, small Windows phones). Tablets
// in landscape are intentionally NOT matched — they get the desktop surface
// since they have enough width. This is a heuristic; the client-side
// ResponsiveSurfaceRedirector corrects edge cases via matchMedia.
const MOBILE_UA = /Android(?:(?=.*Mobile)|(?=.*\bSilk\b))|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Mobile\b/i;

function isMobileRequest(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return MOBILE_UA.test(ua);
}

function hasDesktopCookie(req: NextRequest): boolean {
  return req.cookies.get("nirman-desktop")?.value === "1";
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── "View desktop" escape hatch ────────────────────────────
  // Sets a session-only cookie (no maxAge → expires when browser closes)
  // so the ResponsiveSurfaceRedirector stops forcing mobile. This lets a
  // phone user reach the full desktop ERP if they really need to, but the
  // preference doesn't persist across browser sessions.
  if (searchParams.get("desktop") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("nirman-desktop", "1", {
      path: "/",
      sameSite: "lax",
    });
    return res;
  }

  // ── Server-side mobile redirect (eliminates flash) ─────────
  // Only redirect the bare home route "/" — deep desktop routes are
  // responsive and never auto-redirected. The client-side redirector
  // handles the reverse case and resize scenarios.
  if (
    pathname === "/" &&
    !hasDesktopCookie(req) &&
    isMobileRequest(req)
  ) {
    return NextResponse.redirect(new URL("/m", req.url));
  }

  // AUTH_BYPASS=true: skip the auth gate entirely (headless dev mode).
  // Hard-gated to non-production so it can never leak into a real deploy
  // even if the env var is accidentally set.
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Public routes — always accessible
  if (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/)
  ) {
    return NextResponse.next();
  }

  // API routes: let them through without a cookie redirect. Each route
  // handler calls apiHandler()/getSession() which returns a proper 401
  // JSON response when there's no session. The client-side 401 fetch
  // interceptor (in AppShell/MobileShell) then redirects to /sign-in.
  // Redirecting API routes here would serve HTML to fetch() callers,
  // causing JSON parse errors ("Fetch failed loading").
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check for the better-auth session cookie.
  // better-auth uses "better-auth.session_token" in dev and
  // "__Secure-better-auth.session_token" in production (secure cookie prefix).
  // Also check the ".sig" variant used for signed cookies.
  const sessionCookie =
    req.cookies.get("better-auth.session_token")?.value ||
    req.cookies.get("__Secure-better-auth.session_token")?.value ||
    req.cookies.get("better-auth.session_token.sig")?.value ||
    req.cookies.get("__Secure-better-auth.session_token.sig")?.value;

  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", req.url);
    // Preserve the intended destination so we can redirect after sign-in.
    // For mobile users hitting "/", redirect to "/m" after sign-in (not "/")
    // so they land on the mobile surface, not the desktop home.
    const redirectTarget =
      pathname === "/" && isMobileRequest(req) && !hasDesktopCookie(req)
        ? "/m"
        : pathname;
    signInUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static assets (handled in the function above too)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
