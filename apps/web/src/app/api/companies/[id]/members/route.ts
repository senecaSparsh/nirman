import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";
import { normalizeRole } from "@/lib/roles";

/**
 * GET /api/companies/[id]/members — list the users that are members of
 * a company, with their per-membership role.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;

  const members = await prisma.userCompany.findMany({
    where: { companyId: id },
    orderBy: { user: { name: "asc" } },
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
  });

  return json(
    members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
      active: m.user.active,
    })),
  );
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.string().optional(),
});

/**
 * POST /api/companies/[id]/members — add a user to a company by email.
 * If the user doesn't exist yet, they are created (invited) with the
 * given role as their default role. The membership role takes precedence
 * when operating within this company.
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const role = normalizeRole(parsed.data.role);

  const company = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!company) return json({ error: "Company not found" }, { status: 404 });

  // Find or create the user by email.
  let user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.email.split("@")[0] ?? parsed.data.email,
        role,
        emailVerified: false,
      },
    });
  }

  // Idempotent membership upsert.
  const membership = await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId: id } },
    update: { role },
    create: { userId: user.id, companyId: id, role },
    select: { id: true, userId: true, role: true },
  });

  return json({ ok: true, membership }, { status: 201 });
});
