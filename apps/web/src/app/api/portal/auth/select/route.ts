import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { PORTAL_COOKIE_NAME, PORTAL_COOKIE_MAX_AGE } from "@/lib/portal-auth";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";

/**
 * POST /api/portal/auth/select — select which customer to log in as
 * (when multiple customers share the same phone number).
 *
 * Body: `{ customerId: string }`
 */
export const POST = async (req: NextRequest) => {
  try {
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
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      return json({ error: "Malformed JSON in request body" }, { status: 400 });
    }
    if (err instanceof ForbiddenError) {
      return json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message }, { status: 401 });
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2024") {
      console.error("[apiHandler] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[apiHandler] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[apiHandler] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[apiHandler] Unhandled error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
