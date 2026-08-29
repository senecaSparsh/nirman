import { createHmac, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";

/**
 * Phone-OTP login helpers.
 *
 * These functions implement a phone-based login flow that produces a **real
 * Better-Auth session** — identical to what `signIn.email` creates — so that
 * `getSession()`, middleware, `/api/me`, and company selection all work the
 * same as email+password login.
 *
 * The session is created via `auth.$context.internalAdapter.createSession()`
 * (the same internal call Better-Auth's own sign-in route uses), and the
 * session cookie is signed with the same HMAC-SHA256 algorithm that
 * `better-call`'s `setSignedCookie` uses.
 */

/** Strip everything except digits — normalises +91, spaces, dashes, etc. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** Cryptographically-secure 6-digit OTP code. */
export function generateOtpCode(): string {
  // Use 4 bytes of crypto-random data, mod 1_000_000, zero-padded to 6 digits.
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export const OTP_CONFIG = {
  TTL_MINUTES: 5,
  MAX_ATTEMPTS: 5,
  CODE_LENGTH: 6,
} as const;

/**
 * Create a real Better-Auth session for the given user ID and return a
 * ready-to-use `Set-Cookie` header value for the session token cookie.
 *
 * This replicates what Better-Auth's sign-in route does:
 *   1. `auth.$context.internalAdapter.createSession(userId)` → DB session row
 *   2. Sign the token: `encodeURIComponent(token + "." + base64(HMAC-SHA256(token, secret)))`
 *   3. Build the `Set-Cookie` header with the cookie name + attributes
 *
 * The cookie name is `better-auth.session_token` (or `__Secure-` prefixed in
 * HTTPS production). The attributes match the auth config: HttpOnly, Path=/,
 * SameSite=Lax, Max-Age=365 days.
 */
export async function createPhoneSession(userId: string): Promise<{
  setCookieHeader: string;
  session: { id: string; token: string; userId: string; expiresAt: Date };
}> {
  // 1. Create the session via Better-Auth's internal adapter — same call the
  //    sign-in route makes. This creates a Session row in the DB.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (auth as any).$context.internalAdapter.createSession(userId);
  if (!session) throw new Error("Failed to create session");

  // 2. Determine the cookie name + attributes from the auth config.
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-fallback-secret-not-for-production-use-32chars";
  const isProduction = process.env.NODE_ENV === "production";
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const isHttps = baseURL.startsWith("https://") || (isProduction && !baseURL.startsWith("http://"));
  const securePrefix = isHttps ? "__Secure-" : "";
  const cookieName = `${securePrefix}better-auth.session_token`;

  // Session expiry from auth.ts: 365 days
  const maxAge = 60 * 60 * 24 * 365;

  // 3. Sign the token: HMAC-SHA256(token, secret) → base64, then
  //    encodeURIComponent(token + "." + signature).
  const signature = createHmac("sha256", secret).update(session.token).digest("base64");
  const signedValue = `${session.token}.${signature}`;
  const encodedValue = encodeURIComponent(signedValue);

  // 4. Build the Set-Cookie header.
  const parts = [
    `${cookieName}=${encodedValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push("Secure");

  return {
    setCookieHeader: parts.join("; "),
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: session.expiresAt,
    },
  };
}
