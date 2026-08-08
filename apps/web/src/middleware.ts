import { NextRequest, NextResponse } from "next/server";

/**
 * Mobile detection — a simple UA substring check. Good enough for an
 * ERP internal tool; we don't need a full device database. Tablets
 * count as mobile (they want the touch-optimized surface too).
 */
function isMobileUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /android|iphone|ipad|ipod|opera mini|mobile|pda|windows phone|symbian/i.test(ua);
}

/**
 * Auth + mobile-gate middleware.
 *
 * Mobile gate (runs in ALL environments, including dev, so mobile can be
 * tested locally): when a mobile UA hits the exact root "/", redirect to
 * the persona-scoped mobile surface at /m. A `nirman-desktop=1` cookie
 * (set by the "View desktop site" link, which hits "/?desktop=1") opts
 * the user out so they can reach the full desktop ERP on a phone if they
 * really want to. Desktop UAs are never redirected — desktop is 100%
 * unchanged. Only the exact "/" path is affected; every other desktop
 * route (/projects, /gl, ...) is left alone even on mobile UA, so mobile
 * users who drill into a desktop link from the "More" tab aren't bounced.
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
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── "View desktop" escape hatch ────────────────────────────
  // The mobile "More" tab links to /?desktop=1. Set a cookie so the
  // mobile gate stops redirecting, then drop the query and serve desktop.
  if (searchParams.get("desktop") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("nirman-desktop", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return res;
  }

  // ── Mobile gate: only the exact root, only mobile UA ───────
  if (
    pathname === "/" &&
    !req.cookies.get("nirman-desktop")?.value &&
    isMobileUA(req.headers.get("user-agent"))
  ) {
    return NextResponse.redirect(new URL("/m", req.url));
  }

  // AUTH_BYPASS=true: skip the auth gate entirely (headless dev mode).
  if (process.env.AUTH_BYPASS === "true") {
    return NextResponse.next();
  }

  // Public routes — always accessible
  if (
    pathname === "/sign-in" ||
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
  // better-auth uses "better-auth.session_token" (and a .sig variant for signed cookies).
  const sessionCookie =
    req.cookies.get("better-auth.session_token")?.value ||
    req.cookies.get("better-auth.session_token.sig")?.value;

  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", req.url);
    // Preserve the intended destination so we can redirect after sign-in
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static assets (handled in the function above too)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
