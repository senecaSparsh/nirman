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

const PORTAL_SECRET = process.env.PORTAL_COOKIE_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-portal-secret";

/**
 * Sign a customer ID with HMAC-SHA256.
 * Returns `customerId.hexSignature`.
 */
export function signPortalCookie(customerId: string): string {
  const hmac = createHmac("sha256", PORTAL_SECRET).update(customerId).digest("hex");
  return `${customerId}.${hmac}`;
}

/**
 * Verify a signed cookie value. Returns the customer ID if valid, null otherwise.
 */
export function verifyPortalCookie(value: string): string | null {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === value.length - 1) return null;
  const customerId = value.slice(0, dotIdx);
  const signature = value.slice(dotIdx + 1);
  if (!customerId || !signature) return null;
  // Validate hex signature
  if (!/^[0-9a-f]+$/i.test(signature)) return null;
  const expected = createHmac("sha256", PORTAL_SECRET).update(customerId).digest("hex");
  // Timing-safe comparison
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
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
  const customerId = cookieStore.get(PORTAL_COOKIE_NAME)?.value;
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
