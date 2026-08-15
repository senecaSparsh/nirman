import { NextRequest, NextResponse } from "next/server";

/**
 * Auth middleware.
 *
 * Surface selection (desktop vs mobile) is NOT done here. It is handled
 * entirely client-side by `ResponsiveSurfaceRedirector`, which watches
 * `matchMedia("(max-width: 1023px)")` and auto-redirects at home routes
 * (`/` ↔ `/m`). Deep routes are never redirected — if you're on
 * `/m/material-sales/new` and resize wide, you stay there. This keeps
 * the surface choice tied to the actual viewport, not a UA string that
 * can be wrong (tablets in landscape, narrow desktop windows, etc.).
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
