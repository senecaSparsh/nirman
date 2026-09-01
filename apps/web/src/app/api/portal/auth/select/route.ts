import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { PORTAL_COOKIE_NAME, PORTAL_COOKIE_MAX_AGE } from "@/lib/portal-auth";

/**
 * POST /api/portal/auth/select — select which customer to log in as
 * (when multiple customers share the same phone number).
 *
 * Body: `{ customerId: string }`
 */
export const POST = async (req: NextRequest) => {
  let body: { customerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.customerId) {
    return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: body.customerId, deletedAt: null },
    select: { id: true, name: true, company: { select: { name: true } } },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const res = NextResponse.json({
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
