import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/users/[id]/activity — recent audit log entries for a user.
 * Returns the last 50 actions performed by or on this user.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { id: userId } = await params;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

  const entries = await prisma.auditLog.findMany({
    where: {
      companyId: company.id,
      OR: [
        { userId },
        { entityType: "User", entityId: userId },
        { entityType: "UserCompany", entityId: userId },
      ],
    },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      timestamp: true,
    },
  });

  return json({ entries });
});
