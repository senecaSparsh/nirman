import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { requireUser } from "@/lib/server";

/**
 * POST /api/company/switch
 * Sets the nirman-company-id cookie to switch the active company.
 *
 * Access control (deliberate policy — matches /api/companies/switch):
 *   - Only OWNER/ADMIN may switch, and only to companies where they hold
 *     an active membership.
 *   - No hierarchy-direction check: an owner must always be able to
 *     return from a subsidiary to the parent (membership is the boundary,
 *     not current position — a "no upward switching" rule strands owners
 *     inside subsidiaries).
 *   - Field staff / non-admin members can never switch, so an accidental
 *     membership in another company stays unreachable for them.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await req.json();
  if (!companyId || typeof companyId !== "string") {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";

  // Same policy as /api/companies/switch: tier-1 users judged by their
  // MEMBERSHIPS, not the global User.role mirror — a member who is
  // SUPERVISOR in one company and OWNER in another must reach both.
  // Pure field staff (no tier-1 membership anywhere) can never switch.
  const memberships = isDevBypass
    ? []
    : await prisma.userCompany.findMany({
        where: { userId: user.id, active: true, company: { deletedAt: null } },
        select: { companyId: true, role: true },
      });
  const TIER1 = new Set(["OWNER", "ADMIN", "DEVELOPER"]);
  const isAdminUser =
    TIER1.has(user.role) || memberships.some((m) => TIER1.has(m.role));
  if (!isDevBypass && !isAdminUser) {
    return NextResponse.json(
      { error: "Only owners and admins can switch companies" },
      { status: 403 },
    );
  }

  // Verify the company exists and user has access
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      deletedAt: null,
      ...(isDevBypass
        ? {}
        : { userMemberships: { some: { userId: user.id, active: true } } }),
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
