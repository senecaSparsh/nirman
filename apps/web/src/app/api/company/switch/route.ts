import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { getCompany, requireUser } from "@/lib/server";

/**
 * POST /api/company/switch
 * Sets the nirman-company-id cookie to switch the active company.
 *
 * Access control:
 *   - OWNER/ADMIN at the top of the hierarchy (no parent company) can
 *     switch to any company they have a membership in.
 *   - Users in a child company (has a parent) CANNOT switch — they are
 *     scoped to their subsidiary.
 *   - Non-owner/admin users CANNOT switch.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const { companyId } = await req.json();
  if (!companyId || typeof companyId !== "string") {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Enforce: only OWNER/ADMIN at the top of the hierarchy can switch
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
  if (!isDevBypass) {
    const current = await getCompany();
    const isOwnerAdmin = user.role === "OWNER" || user.role === "ADMIN";
    if (!isOwnerAdmin || current.parentCompanyId) {
      return NextResponse.json(
        { error: "Only owners at the top of the hierarchy can switch companies" },
        { status: 403 },
      );
    }
  }

  // Verify the company exists and user has access
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
