import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, assertCompanyAccess, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/companies/[id]/scope-options — the projects and departments a
 * member of this company can be scoped to. Feeds the add-member picker for a
 * company the actor manages but isn't a member of.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const denied = await assertCompanyAccess(user, id);
  if (denied) return denied;
  const [projects, departments] = await Promise.all([
    prisma.project.findMany({ where: { companyId: id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { companyId: id, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  return json({ projects, departments });
});
