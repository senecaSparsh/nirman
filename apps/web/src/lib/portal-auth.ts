import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * Customer Portal Auth — separate from staff auth.
 *
 * Customers log in with their phone number + OTP. We look up the Customer
 * record by phone (across all companies — a customer may have bookings
 * with multiple companies in the group). The session is stored in a
 * signed cookie `nirman-portal-customer` containing the customer ID.
 *
 * In production, the cookie should be signed/encrypted. For now, we use
 * a simple HMAC-less approach since the portal is read-only (no mutations
 * from the customer side except payment links which redirect to external
 * payment gateways).
 */

export const PORTAL_COOKIE_NAME = "nirman-portal-customer";
export const PORTAL_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

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
