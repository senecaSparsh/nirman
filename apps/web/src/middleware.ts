import { NextRequest, NextResponse } from "next/server";

/**
 * Auth middleware — the first line of defense.
 *
 * In production: checks for the better-auth session cookie. If missing,
 * redirects to /sign-in. This prevents unauthenticated users from seeing
 * any app page (navbar, sidebar, etc.) — they go straight to the login screen.
 *
 * In development: allows all requests through (AUTH_BYPASS mode returns a
 * synthetic "dev" user from getSession() without needing a real session).
 *
 * Public routes (always accessible, no cookie check):
 *   - /sign-in
 *   - /api/auth/*  (better-auth's own endpoints: sign-in, sign-up, session, etc.)
 *   - Static assets (_next/*, favicon, images)
 */
export function middleware(req: NextRequest) {
  // Dev mode: no auth gate (getSession() returns synthetic dev user)
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Public routes — always accessible
  if (
    pathname === "/sign-in" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/)
  ) {
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
