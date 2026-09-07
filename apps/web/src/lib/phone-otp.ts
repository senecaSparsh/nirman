import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@nirman/db";

/**
 * Phone-OTP login helpers.
 *
 * These functions implement a phone-based login flow that produces a **real
 * Better-Auth session** — identical to what `signIn.email` creates — so that
 * `getSession()`, middleware, `/api/me`, and company selection all work the
 * same as email+password login.
 *
 * The session is created directly in the DB (same table Better-Auth uses),
 * and the session cookie is signed with the same HMAC-SHA256 algorithm that
 * Better-Auth's `setSignedCookie` uses.
 */

/** Strip everything except digits — normalises +91, spaces, dashes, etc. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Given a raw phone input, return ALL possible normalized variants so the
 * caller can do a `phoneNormalized: { in: variants }` lookup. This handles
 * the case where a user enters "+91 70179 88293" (→ 12 digits) but the
 * stored `phoneNormalized` is "7017988293" (10 digits), or vice versa.
 *
 * Indian mobile numbers can be entered as:
 *   - 10 digits:     "7017988293"
 *   - 11 digits:     "07017988293" (leading 0)
 *   - 12 digits:     "917017988293" (91 prefix)
 *   - 13 digits:     "9107017988293" (91 + leading 0)
 *
 * Returns a de-duplicated array of all plausible digit-only variants.
 */
export function normalizePhoneForLookup(input: string): string[] {
  const digits = input.replace(/\D/g, "");
  const variants = new Set<string>([digits]);

  // 12 digits starting with 91 → add 10-digit version
  if (digits.length === 12 && digits.startsWith("91")) {
    variants.add(digits.slice(2));
  }
  // 10 digits → add 12-digit version with 91 prefix
  if (digits.length === 10) {
    variants.add("91" + digits);
  }
  // 11 digits starting with 0 → add 10-digit and 12-digit versions
  if (digits.length === 11 && digits.startsWith("0")) {
    const ten = digits.slice(1);
    variants.add(ten);
    variants.add("91" + ten);
  }
  // 13 digits starting with 910 → add 10-digit and 12-digit versions
  if (digits.length === 13 && digits.startsWith("910")) {
    const ten = digits.slice(3);
    variants.add(ten);
    variants.add("91" + ten);
  }

  return Array.from(variants);
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
 * This creates a Session row directly in the DB (same table Better-Auth uses),
 * then signs the token cookie with HMAC-SHA256 using the same secret.
 *
 * The cookie name is `better-auth.session_token` (or `__Secure-` prefixed in
 * HTTPS production). The attributes match the auth config: HttpOnly, Path=/,
 * SameSite=Lax, Max-Age=365 days.
 */
export async function createPhoneSession(userId: string): Promise<{
  setCookieHeader: string;
  session: { id: string; token: string; userId: string; expiresAt: Date };
}> {
  // 1. Create the session directly in the DB — same table Better-Auth uses.
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 365 * 1000); // 365 days

  const session = await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

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
