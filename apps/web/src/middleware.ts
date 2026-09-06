import { NextRequest, NextResponse } from "next/server";

/**
 * Auth + surface-selection middleware.
 *
 * SURFACE SELECTION (mobile vs desktop):
 * The ONLY surface redirect is done HERE (server-side, UA-based) for the
 * bare home route "/" — this is a one-time *landing* redirect that sends
 * mobile users to "/m" so they never see a flash of desktop content.
 * There is NO reverse redirect ("/m" → "/") and NO client-side surface
 * swapping. Once a user is on a surface (desktop "/" or mobile "/m"),
 * they stay there — regardless of resize, navigation, or UA. This
 * eliminates the disruptive desktop↔mobile redirects.
 *
 * Rules:
 *   · "/" + mobile UA + no desktop cookie  →  302 to "/m"  (one-time landing)
 *   · "/m" on any UA                       →  stays on "/m" (no reverse redirect)
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
// since they have enough width. This is a heuristic; there is no longer a
// client-side corrector — once landed on a surface, the user stays there.
const MOBILE_UA = /Android(?:(?=.*Mobile)|(?=.*\bSilk\b))|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Mobile\b/i;

/** Test if a User-Agent string is a mobile device. */
export function isMobileUA(ua: string): boolean {
  return MOBILE_UA.test(ua);
}

function isMobileRequest(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return isMobileUA(ua);
}

function hasDesktopCookie(req: NextRequest): boolean {
  return req.cookies.get("nirman-desktop")?.value === "1";
}

/** Check if a pathname is a public route (always accessible, no cookie check). */
export function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/change-password" ||
    pathname.startsWith("/change-password/") ||
    pathname === "/consent" ||
    pathname.startsWith("/consent/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/telephony/webhook") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/portal/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/.test(pathname)
  );
}

/** Check if a pathname is an auth rate-limited endpoint (sign-in/sign-up/password). */
export function isAuthRateLimitedPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/auth/")) return false;
  return /sign-in|sign-up|password/.test(pathname);
}

// ── Edge-compatible auth rate limiter ──────────────────────────
// Simple in-memory token bucket for auth endpoints. Edge runtime can't
// use node:os/node:fs (the main rate-limit.ts), so this is a lightweight
// standalone limiter. State persists within a single instance (Render
// single-instance deploy). 10 attempts per IP per minute.
const authBuckets = new Map<string, { count: number; resetAt: number }>();
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 10;

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = authBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    authBuckets.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= AUTH_MAX_ATTEMPTS;
}

// Periodically evict expired buckets (runs on each call, cheap).
function evictAuthBuckets() {
  const now = Date.now();
  for (const [key, bucket] of authBuckets) {
    if (now > bucket.resetAt) authBuckets.delete(key);
  }
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "local";
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── "View desktop" escape hatch ────────────────────────────
  // Sets a session-only cookie (no maxAge → expires when browser closes)
  // so the one-time landing redirect stops sending the user to "/m". This
  // lets a phone user reach the full desktop ERP if they really need to,
  // but the preference doesn't persist across browser sessions.
  if (searchParams.get("desktop") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("nirman-desktop", "1", {
      path: "/",
      sameSite: "lax",
    });
    return res;
  }

  // ── Server-side mobile landing redirect (eliminates flash) ────
  // ONE-TIME landing only: a mobile UA hitting the bare desktop home "/"
  // is sent to "/m" so they never see a flash of desktop content. This is
  // NOT a surface swap — it only fires at the entry point "/". Once on
  // "/m" (or any deep route), the user stays there regardless of UA or
  // viewport. There is no reverse redirect and no cross-surface redirect.
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
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/change-password" ||
    pathname.startsWith("/change-password/") ||
    pathname === "/consent" ||
    pathname.startsWith("/consent/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/telephony/webhook") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/portal/") ||
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
    // Rate-limit auth endpoints (sign-in, sign-up, password) to prevent
    // brute-force attacks. Better-Auth's built-in rate limiter is disabled,
    // so this is the primary gate.
    if (isAuthRateLimitedPath(pathname)) {
      evictAuthBuckets();
      const ip = getClientIp(req);
      if (!checkAuthRateLimit(ip)) {
        return NextResponse.json(
          { error: "Too many attempts. Please wait a minute and try again." },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      }
    }
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
  // Run on all routes except static assets, non-auth API routes, and files
  // with extensions. Auth API routes (/api/auth/*) ARE included so the
  // rate limiter can protect sign-in/sign-up/password endpoints. Other API
  // routes are excluded to avoid running UA regex + cookie logic on every
  // API call — a meaningful saving under load.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/telephony|api/portal|api/telephony|api/health|api/cron|.*\\..*).*)",
    "/api/auth/(.*)",
  ],
};
