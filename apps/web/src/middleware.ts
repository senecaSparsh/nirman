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
 * Routes that are exempt from the mobile gate — they exist only on the
 * desktop surface and have no mobile equivalent (print views, auth
 * callbacks, static assets, API endpoints).
 */
function isExemptFromMobileGate(pathname: string): boolean {
  // Mobile surface — already on /m
  if (pathname === "/m" || pathname.startsWith("/m/")) return true;
  // Auth pages
  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) return true;
  // Print views (desktop-only by design)
  if (pathname === "/print" || pathname.startsWith("/print/")) return true;
  // API routes (return JSON, not HTML surfaces)
  if (pathname.startsWith("/api/")) return true;
  // Next.js internals
  if (pathname.startsWith("/_next/")) return true;
  // Static files
  if (pathname.startsWith("/favicon")) return true;
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt)$/.test(pathname)) return true;
  return false;
}

/**
 * Auth + mobile-gate middleware.
 *
 * Mobile gate (runs in ALL environments, including dev, so mobile can be
 * tested locally): when a mobile UA hits ANY desktop route, redirect to
 * /m. This prevents mobile users from landing on desktop pages via
 * direct URLs, bookmarks, or shared links. A `nirman-desktop=1` cookie
 * (set by "/?desktop=1") opts the user out — but it's session-only now,
 * so closing the browser resets the preference. Desktop UAs are never
 * redirected.
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
  // Sets a session-only cookie (no maxAge → expires when browser closes)
  // so the mobile gate stops redirecting. This lets a phone user reach
  // the full desktop ERP if they really need to, but the preference
  // doesn't persist across browser sessions.
  if (searchParams.get("desktop") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("nirman-desktop", "1", {
      path: "/",
      sameSite: "lax",
    });
    return res;
  }

  // ── Mobile gate: ALL desktop routes, mobile UA ─────────────
  // Redirect any desktop route to /m when the user is on a mobile UA
  // and hasn't set the nirman-desktop override cookie. This catches
  // direct navigation, bookmarks, and shared links — not just the root.
  if (
    !isExemptFromMobileGate(pathname) &&
    !req.cookies.get("nirman-desktop")?.value &&
    isMobileUA(req.headers.get("user-agent"))
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
