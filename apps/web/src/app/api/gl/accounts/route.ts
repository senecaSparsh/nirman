import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gl/accounts
 * Returns the chart of accounts (all GlAccount rows), ordered by code.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const accounts = await prisma.glAccount.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true, type: true, isSystem: true, description: true },
  });
  return json(accounts);
});
