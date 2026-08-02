import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@nirman/db";
import { apiHandler, getCurrentUser, json, requireUser } from "@/lib/server";
import { z } from "zod";

const switchSchema = z.object({ companyId: z.string().min(1) });

/**
 * POST /api/companies/switch — set the active company for the current
 * user by writing a long-lived cookie. The user must be a member of the
 * target company (or be the dev-bypass user, who can switch to any).
 * Subsequent server-side getCompany() reads this cookie.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { companyId } = parsed.data;

  const isDevBypass = user.id === "dev";
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      deletedAt: null,
      ...(isDevBypass ? {} : { userMemberships: { some: { userId: user.id } } }),
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
