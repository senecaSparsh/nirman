import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { normalizePhone } from "@/lib/phone-otp";
import { PORTAL_COOKIE_NAME, PORTAL_COOKIE_MAX_AGE } from "@/lib/portal-auth";

/**
 * POST /api/portal/auth/otp/verify — verify OTP and log in the customer.
 *
 * Body: `{ phone: string, code: string }`
 *
 * If multiple customers share the same phone (different companies), returns
 * a list of customers to pick from. Otherwise, sets the session cookie and
 * returns the customer.
 */
export const POST = async (req: NextRequest) => {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = body.phone?.trim();
  const code = body.code?.trim();
  if (!rawPhone || !code) {
    return NextResponse.json({ error: "Phone and code are required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);

  // Find the most recent unused OTP for this phone
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!otp || otp.code !== code) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  // Mark OTP as used
  await prisma.phoneOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  // Find customers by phone
  // Find customers by phone — match on last 10 digits (ignoring spaces/country code)
  const digitsOnly = rawPhone.replace(/\D/g, "");
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
      email: true,
      companyId: true,
      company: { select: { name: true } },
      _count: { select: { assetSales: { where: { status: "ACTIVE" } } } },
    },
    take: 50,
  });
  const customers = candidates.filter(
    (c) => c.phone && c.phone.replace(/\D/g, "").slice(-10) === last10,
  );

  if (customers.length === 0) {
    return NextResponse.json({ error: "No account found for this phone number." }, { status: 404 });
  }

  // If multiple customers, return the list for selection
  if (customers.length > 1) {
    return NextResponse.json({
      requiresSelection: true,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        companyName: c.company.name,
        activeBookings: c._count.assetSales,
      })),
    });
  }

  // Single customer — set cookie and return
  const customer = customers[0]!;
  const res = NextResponse.json({
    requiresSelection: false,
    customer: {
      id: customer.id,
      name: customer.name,
      companyName: customer.company.name,
    },
  });
  res.cookies.set(PORTAL_COOKIE_NAME, customer.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: PORTAL_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
};
