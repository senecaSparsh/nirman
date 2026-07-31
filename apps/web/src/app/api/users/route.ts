import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/users — list all users (for task assignment dropdowns).
 * Returns id, name, email, role, active.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.USERS_VIEW);
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  return json(users);
});
