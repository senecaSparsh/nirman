import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@nirman/db";

/**
 * Supplier Portal Auth — vendors log in with their registered phone + OTP
 * and see their POs, invoices, and payment status across the company(ies)
 * they supply. Same pattern as the customer portal (`portal-auth.ts`) —
 * a separate signed cookie `nirman-portal-supplier` containing `supplierId
 * .expiresAt.hmac`.
 */

export const SUPPLIER_PORTAL_COOKIE_NAME = "nirman-portal-supplier";
export const SUPPLIER_PORTAL_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const PORTAL_SECRET =
  process.env.PORTAL_COOKIE_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? "" : "dev-portal-secret");

if (process.env.NODE_ENV === "production" && !PORTAL_SECRET) {
  throw new Error(
    "Supplier portal auth: no signing secret configured. Set PORTAL_COOKIE_SECRET (or NEXTAUTH_SECRET/BETTER_AUTH_SECRET) — refusing to sign supplier sessions with a public default.",
  );
}

export function signSupplierPortalCookie(supplierId: string): string {
  const expiresAt = Date.now() + SUPPLIER_PORTAL_COOKIE_MAX_AGE * 1000;
  const payload = `${supplierId}.${expiresAt}`;
  const hmac = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

export function verifySupplierPortalCookie(value: string): string | null {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === value.length - 1) return null;
  const payload = value.slice(0, dotIdx);
  const signature = value.slice(dotIdx + 1);
  if (!payload || !signature) return null;
  if (!/^[0-9a-f]+$/i.test(signature)) return null;
  const expIdx = payload.lastIndexOf(".");
  if (expIdx <= 0 || expIdx === payload.length - 1) return null;
  const supplierId = payload.slice(0, expIdx);
  const expiresAt = parseInt(payload.slice(expIdx + 1), 10);
  if (!supplierId || isNaN(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;
  const expected = createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return supplierId;
}

export interface PortalSupplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  companyId: string;
  companyName: string;
}

export async function getPortalSupplier(): Promise<PortalSupplier | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SUPPLIER_PORTAL_COOKIE_NAME)?.value;
  if (!raw) return null;
  const supplierId = verifySupplierPortalCookie(raw);
  if (!supplierId) return null;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      gstin: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });
  if (!supplier) return null;

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    gstin: supplier.gstin,
    companyId: supplier.companyId,
    companyName: supplier.company.name,
  };
}

export async function requirePortalSupplier(): Promise<PortalSupplier> {
  const supplier = await getPortalSupplier();
  if (!supplier) throw new Error("UNAUTHORIZED");
  return supplier;
}

/**
 * Find suppliers by phone (across all companies — a vendor may supply
 * multiple group entities). Mirrors findCustomersByPhone.
 */
export async function findSuppliersByPhone(phone: string) {
  const digitsOnly = phone.replace(/\D/g, "");
  const last10 = digitsOnly.slice(-10);
  const last4 = digitsOnly.slice(-4);
  const candidates = await prisma.supplier.findMany({
    where: { phone: { contains: last4 }, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      companyId: true,
      company: { select: { name: true } },
      _count: { select: { purchaseOrders: true } },
    },
    take: 50,
  });
  return candidates.filter(
    (s) => s.phone && s.phone.replace(/\D/g, "").slice(-10) === last10,
  );
}
