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
  if (!isDevBypass && user.role !== "OWNER" && user.role !== "ADMIN") {
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
