import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { getCurrentUser } from "@/lib/server";

/**
 * POST /api/company/switch
 * Sets the nirman-company-id cookie to switch the active company.
 * Validates that the user has a membership in the target company.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await req.json();
  if (!companyId || typeof companyId !== "string") {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Verify the company exists and user has access
  const isDevBypass = process.env.AUTH_BYPASS === "true";
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      deletedAt: null,
      ...(isDevBypass
        ? {}
        : { userMemberships: { some: { userId: user.id } } }),
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Company not found or no access" }, { status: 403 });
  }

  // Set the cookie (30 days)
  const cookieStore = await cookies();
  cookieStore.set("nirman-company-id", companyId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });

  return NextResponse.json({ ok: true, companyId });
}
