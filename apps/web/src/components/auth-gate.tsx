"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * AUTH GATE — enforces the two legal/security flags the session carries:
 *
 *   - mustChangePassword — user was provisioned with a placeholder password
 *     (e.g. employee account created by HR); they must set a real one first.
 *   - consentAccepted — an active call-monitoring consent policy exists and
 *     this user hasn't accepted it. Call recording consent is a legal
 *     requirement; unconsented staff must be blocked until they accept.
 *
 * The flags come from GET /api/me/auth-info (one fetch on mount). The page
 * redirect is client-side — middleware can't do it because consent/password
 * state lives in the DB, not the session cookie.
 *
 * Skips all public surfaces (sign-in, portal, print, token-auth /accept) and
 * the gate destinations themselves (/consent, /change-password) so we never
 * loop. Renders nothing.
 */
const SKIP_PREFIXES = [
  "/consent",
  "/change-password",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/accept/",
  "/api/",
  "/_next/",
  "/portal",
  "/print",
];

export function AuthGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;

    let cancelled = false;
    fetch("/api/me/auth-info", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.mustChangePassword === true) {
          router.replace("/change-password");
        } else if (data.consentAccepted === false) {
          router.replace("/consent");
        }
      })
      .catch(() => {
        /* silent — a failed gate check must not block the app */
      });
    return () => {
      cancelled = true;
    };
    // Only re-check on full navigations (pathname change), not every render.
  }, [pathname, router]);

  return null;
}
