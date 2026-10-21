import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { normalizePhone } from "@/lib/phone-otp";
import { PORTAL_PREAUTH_COOKIE_NAME, PORTAL_PREAUTH_MAX_AGE, signPortalPreauthToken } from "@/lib/portal-auth";
import { SUPPLIER_PORTAL_COOKIE_NAME, SUPPLIER_PORTAL_COOKIE_MAX_AGE, signSupplierPortalCookie, findSuppliersByPhone } from "@/lib/supplier-portal-auth";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/supplier-portal/auth/otp/verify — verify the OTP and log the
 * supplier in. Multiple suppliers on one phone → requiresSelection +
 * pre-auth cookie (same phone-proof token the customer portal uses).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!rawPhone || !code) {
    return json({ error: "Phone and code are required." }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone);

  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return json({ error: "Invalid or expired code." }, { status: 400 });

  const MAX_ATTEMPTS = 5;
  if (otp.attempts >= MAX_ATTEMPTS) {
    return json({ error: "Too many attempts. Please request a new code." }, { status: 429 });
  }
  if (otp.code !== code) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
    return json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` }, { status: 400 });
  }
  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

  const suppliers = await findSuppliersByPhone(rawPhone);
  if (suppliers.length === 0) {
    return json({ error: "No supplier account found for this phone number." }, { status: 404 });
  }

  if (suppliers.length > 1) {
    const res = NextResponse.json({
      requiresSelection: true,
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        companyName: s.company.name,
        openOrders: s._count.purchaseOrders,
      })),
    });
    res.cookies.set(PORTAL_PREAUTH_COOKIE_NAME, signPortalPreauthToken(phone), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: PORTAL_PREAUTH_MAX_AGE,
      path: "/",
    });
    return res;
  }

  const supplier = suppliers[0]!;
  const res = NextResponse.json({
    requiresSelection: false,
    supplier: { id: supplier.id, name: supplier.name, companyName: supplier.company.name },
  });
  res.cookies.set(SUPPLIER_PORTAL_COOKIE_NAME, signSupplierPortalCookie(supplier.id), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SUPPLIER_PORTAL_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}, { skipSession: true, rateLimit: "auth" });
