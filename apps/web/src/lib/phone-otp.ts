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
 * The session is created via Better-Auth's own `internalAdapter.createSession`
 * (same method `signInEmail` uses internally), and the session cookie is signed
 * with the same HMAC-SHA256 algorithm + secret that Better-Auth's
 * `setSignedCookie` uses. The cookie name and attributes are read from
 * Better-Auth's own context (`auth.$context.authCookies`), so they always
 * match — including the `__Secure-` prefix in HTTPS production.
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
 * Create a real Better-Auth session for the given user ID and return the
 * cookie name, signed value, and attributes so the caller can set it via
 * `NextResponse.cookies.set()` — the proper Next.js way.
 *
 * Uses Better-Auth's own `internalAdapter.createSession()` (same method
 * `signInEmail` calls internally) to create the Session row, then signs the
 * cookie value with the same HMAC-SHA256 algorithm + secret that Better-Auth's
 * `setSignedCookie` uses. The cookie name and attributes are read from
 * Better-Auth's own context (`auth.$context.authCookies`), so they always
 * match — including the `__Secure-` prefix in HTTPS production.
 */
export async function createPhoneSession(userId: string): Promise<{
  cookie: {
    name: string;
    value: string;
    attributes: {
      path?: string;
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      maxAge?: number;
      secure?: boolean;
      domain?: string;
    };
  };
  session: { id: string; token: string; userId: string; expiresAt: Date };
}> {
  // 1. Access Better-Auth's internal context (same context used by signInEmail).
  const ctx = await auth.$context;

  // 2. Create the session via Better-Auth's own internal adapter — this is
  //    the exact same call that signInEmail makes internally, so the Session
  //    row is identical to what an email+password login would produce.
  const session = await ctx.internalAdapter.createSession(userId);

  if (!session) {
    throw new Error("Failed to create session — Better-Auth internal adapter returned null.");
  }

  // 3. Read the cookie name + attributes from Better-Auth's own config.
  //    This guarantees the cookie name matches what getSession() expects,
  //    including the __Secure- prefix in HTTPS production.
  const cookieConfig = ctx.authCookies.sessionToken;
  const cookieName = cookieConfig.name;
  const attrs = cookieConfig.attributes;

  // 4. Sign the cookie value using the same HMAC-SHA256 algorithm + secret
  //    that Better-Auth's setSignedCookie uses. We've verified that Node.js
  //    createHmac("sha256", secret).update(token).digest("base64") produces
  //    byte-identical output to Better-Auth's WebCrypto-based signCookieValue.
  //    NOTE: We do NOT encodeURIComponent the value here — NextResponse.cookies.set()
  //    does its own encoding, and double-encoding would break signature verification.
  //    Better-Auth's parseCookies() does decodeURIComponent on read, so the
  //    round-trip is: raw signed value → cookies.set() encodes → browser stores
  //    encoded → browser sends encoded → parseCookies decodes → raw signed value. ✓
  const secret = ctx.secret;
  const signature = createHmac("sha256", secret).update(session.token).digest("base64");
  const signedValue = `${session.token}.${signature}`;

  return {
    cookie: {
      name: cookieName,
      value: signedValue,
      attributes: {
        path: attrs.path,
        httpOnly: attrs.httpOnly,
        sameSite: attrs.sameSite as "lax" | "strict" | "none" | undefined,
        maxAge: typeof attrs.maxAge === "number" ? Math.floor(attrs.maxAge) : undefined,
        secure: attrs.secure,
        domain: attrs.domain,
      },
    },
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
    },
  };
}
