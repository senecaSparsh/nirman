import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM, normalizeRole } from "@/lib/roles";
import { z } from "zod";

const updateMemberSchema = z.object({ role: z.string() });

/**
 * PATCH /api/companies/[id]/members/[memberId] — change a member's
 * per-company role.
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;
  const body = await req.json();
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const role = normalizeRole(parsed.data.role);

  const updated = await prisma.userCompany.update({
    where: { id: memberId, companyId: id },
    data: { role },
    select: { id: true, role: true },
  });
  return json(updated);
});

/**
 * DELETE /api/companies/[id]/members/[memberId] — remove a user from
 * this company. They lose access to it but their user account is kept.
 */
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;
  await prisma.userCompany.delete({ where: { id: memberId, companyId: id } });
  return json({ ok: true });
});
