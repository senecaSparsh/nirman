import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@nirman/db";
import { } from "@/lib/phone-otp";

/**
 * Customer Portal Auth — separate from staff auth.
 *
 * Customers log in with their phone number + OTP. We look up the Customer
 * record by phone (across all companies — a customer may have bookings
 * with multiple companies in the group). The session is stored in a
 * signed cookie `nirman-portal-customer` containing the customer ID.
 *
 * The cookie value is `customerId.hmac` where hmac = HMAC-SHA256(secret, customerId).
 * This prevents tampering with the customer ID.
 */

export const PORTAL_COOKIE_NAME = "nirman-portal-customer";
export const PORTAL_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/**
 * Short-lived pre-auth token cookie name.
 * Issued by otp/verify when multiple customers share a phone, consumed
 * by the select endpoint. Proves the caller completed OTP verification.
 */
export const PORTAL_PREAUTH_COOKIE_NAME = "nirman-portal-preauth";
export const PORTAL_PREAUTH_MAX_AGE = 5 * 60; // 5 minutes

// Secret chain: dedicated portal secret → NextAuth secret → Better-Auth
// secret (the one actually configured in deploys) → dev-only fallback.
// In production there is NO safe default — a hardcoded secret would let
// anyone who reads the source forge a signed customer cookie.
const PORTAL_SECRET =
  process.env.PORTAL_COOKIE_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? "" : "dev-portal-secret");

if (process.env.NODE_ENV === "production" && !PORTAL_SECRET) {
  throw new Error(
    "Portal auth: no signing secret configured. Set PORTAL_COOKIE_SECRET (or NEXTAUTH_SECRET/BETTER_AUTH_SECRET) — refusing to sign customer sessions with a public default.",
  );
}

/**
 * Sign a customer ID with HMAC-SHA256.
 * Returns `customerId.expiresAt.hexSignature` — the expiry is part of the
 * signed payload so a captured cookie cannot be replayed after the session
 * window ends (cookie max-age alone is only enforced client-side).
 */
export function signPortalCookie(customerId: string): string {
  const expiresAt = Date.now() + PORTAL_COOKIE_MAX_AGE * 1000;
  const payload = `${customerId}.${expiresAt}`;
  const hmac = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

/**
 * Sign a pre-auth token proving OTP verification was completed.
 * The token encodes the verified phone number + expiry, signed with the
 * portal secret. The select endpoint verifies this before issuing a
 * session cookie.
 */
export function signPortalPreauthToken(phone: string): string {
  const expiresAt = Date.now() + PORTAL_PREAUTH_MAX_AGE * 1000;
  const payload = `${phone}.${expiresAt}`;
  const hmac = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

/**
 * Verify a pre-auth token. Returns the phone number if valid and not
 * expired, null otherwise.
 */
export function verifyPortalPreauthToken(token: string, expectedPhone: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [phone, expiresAtStr, signature] = parts;
  if (!phone || !expiresAtStr || !signature) return false;
  if (!/^[0-9a-f]+$/i.test(signature)) return false;
  // Check expiry
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  // Check phone matches
  if (phone !== expectedPhone) return false;
  // Verify signature
  const payload = `${phone}.${expiresAtStr}`;
  const expected = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Verify a signed cookie value. Returns the customer ID if valid and not
 * expired, null otherwise.
 */
export function verifyPortalCookie(value: string): string | null {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === value.length - 1) return null;
  const payload = value.slice(0, dotIdx);
  const signature = value.slice(dotIdx + 1);
  if (!payload || !signature) return null;
  // Validate hex signature
  if (!/^[0-9a-f]+$/i.test(signature)) return null;
  // Split payload into customerId + expiresAt (customer ids may contain dots —
  // the expiry is always the last segment)
  const expIdx = payload.lastIndexOf(".");
  if (expIdx <= 0 || expIdx === payload.length - 1) return null;
  const customerId = payload.slice(0, expIdx);
  const expiresAt = parseInt(payload.slice(expIdx + 1), 10);
  if (!customerId || isNaN(expiresAt)) return null;
  // Expired sessions are rejected server-side — a stolen cookie cannot be
  // replayed past its window.
  if (Date.now() > expiresAt) return null;
  const expected = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  // Timing-safe comparison
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch (err) {
    console.error("Portal signature verification failed:", err);
    return null;
  }
  return customerId;
}

export interface PortalCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyId: string;
  companyName: string;
}

/**
 * Get the authenticated portal customer from the cookie.
 * Returns null if not logged in.
 */
export async function getPortalCustomer(): Promise<PortalCustomer | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PORTAL_COOKIE_NAME)?.value;
  if (!raw) return null;
  const customerId = verifyPortalCookie(raw);
  if (!customerId) return null;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    companyId: customer.companyId,
    companyName: customer.company.name,
  };
}

/**
 * Require a portal customer — throws if not logged in.
 */
export async function requirePortalCustomer(): Promise<PortalCustomer> {
  const customer = await getPortalCustomer();
  if (!customer) {
    throw new Error("UNAUTHORIZED");
  }
  return customer;
}

/**
 * Find customers by phone number (across all companies).
 * A phone number may match multiple customers if they're with different
 * companies in a group. In that case, the customer picks which one to log in as.
 */
export async function findCustomersByPhone(phone: string) {
  const digitsOnly = phone.replace(/\D/g, "");
  const last10 = digitsOnly.slice(-10);
  const last4 = digitsOnly.slice(-4);
  const candidates = await prisma.customer.findMany({
    where: {
      phone: { contains: last4 },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      companyId: true,
      company: { select: { name: true } },
      _count: { select: { assetSales: { where: { status: "ACTIVE" } } } },
    },
    take: 50,
  });
  return candidates.filter(
    (c) => c.phone && c.phone.replace(/\D/g, "").slice(-10) === last10,
  );
}
