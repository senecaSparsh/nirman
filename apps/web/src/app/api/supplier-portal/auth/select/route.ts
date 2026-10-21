import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { PORTAL_PREAUTH_COOKIE_NAME, verifyPortalPreauthToken } from "@/lib/portal-auth";
import { SUPPLIER_PORTAL_COOKIE_NAME, SUPPLIER_PORTAL_COOKIE_MAX_AGE, signSupplierPortalCookie } from "@/lib/supplier-portal-auth";
import { normalizePhone } from "@/lib/phone-otp";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/supplier-portal/auth/select — pick which supplier account to log
 * in as when one phone maps to several. Requires the pre-auth cookie issued
 * by otp/verify (proof the OTP was completed) — blocks IDOR-by-supplier-id.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const supplierId = typeof body.supplierId === "string" ? body.supplierId : "";
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!supplierId) return json({ error: "Supplier ID is required." }, { status: 400 });
  if (!rawPhone) return json({ error: "Phone number is required." }, { status: 400 });

  const preauthToken = req.cookies.get(PORTAL_PREAUTH_COOKIE_NAME)?.value;
  if (!preauthToken) {
    return json({ error: "OTP verification required. Please request a new code." }, { status: 401 });
  }
  const phone = normalizePhone(rawPhone);
  if (!verifyPortalPreauthToken(preauthToken, phone)) {
    return json({ error: "OTP verification expired. Please request a new code." }, { status: 401 });
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId, deletedAt: null },
    select: { id: true, name: true, phone: true, company: { select: { name: true } } },
  });
  if (!supplier) return json({ error: "Supplier not found" }, { status: 404 });

  // The selected supplier must actually belong to the verified phone.
  const last10 = phone.slice(-10);
  if (!supplier.phone || supplier.phone.replace(/\D/g, "").slice(-10) !== last10) {
    return json({ error: "This supplier is not registered with this phone number." }, { status: 403 });
  }

  const res = NextResponse.json({
    supplier: { id: supplier.id, name: supplier.name, companyName: supplier.company.name },
  });
  res.cookies.set(SUPPLIER_PORTAL_COOKIE_NAME, signSupplierPortalCookie(supplier.id), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SUPPLIER_PORTAL_COOKIE_MAX_AGE,
    path: "/",
  });
  res.cookies.delete(PORTAL_PREAUTH_COOKIE_NAME);
  return res;
}, { skipSession: true, rateLimit: "auth" });
