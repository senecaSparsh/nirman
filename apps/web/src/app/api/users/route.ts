import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/users — list users scoped to the active company (for task
 * assignment dropdowns). Returns id, name, email, role, active.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const users = await prisma.user.findMany({
    where: { memberships: { some: { companyId: company.id } }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  return json(users);
});
