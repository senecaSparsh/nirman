import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";
import { z } from "zod";

const switchSchema = z.object({ companyId: z.string().min(1) });

/**
 * POST /api/companies/switch — set the active company for the current
 * user by writing a long-lived cookie. Subsequent server-side
 * getCompany() reads this cookie.
 *
 * Access control (deliberate policy — matches /api/company/switch):
 * only OWNER/ADMIN may switch, and only to companies where they hold an
 * active membership. Field staff and other members can never switch —
 * an accidental membership in another company stays unreachable.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { companyId } = parsed.data;

  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && user.id === "dev";

  // Authorization set: the user's active memberships. The switcher is for
  // owner/admin-tier users — but that must be judged by their MEMBERSHIPS,
  // not the global User.role mirror: a member who is SUPERVISOR in company
  // A and OWNER in company B is still an owner, and must be able to reach
  // the company they own (both directions — membership is the boundary).
  // A pure field worker holds no tier-1 membership anywhere and can never
  // switch, so an accidental membership stays unreachable.
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
    return json({ error: "Only owners and admins can switch companies" }, { status: 403 });
  }

  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      deletedAt: null,
      ...(isDevBypass ? {} : { userMemberships: { some: { userId: user.id, active: true } } }),
    },
    select: { id: true, name: true },
  });
  if (!company) {
    return json({ error: "Company not found or you do not have access" }, { status: 404 });
  }

  (await cookies()).set("nirman-company-id", company.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    sameSite: "lax",
  });

  return json({ ok: true, company });
});
