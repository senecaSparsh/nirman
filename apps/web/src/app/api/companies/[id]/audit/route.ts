import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/companies/[id]/audit — recent audit-log entries for a company.
 * Requires AUDIT_VIEW. Scoped to the company (member-or-parent access is
 * not re-checked here because AUDIT_VIEW is already an owner/admin gate,
 * but we filter to the requested companyId).
 */
export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.AUDIT_VIEW);
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const logs = await prisma.auditLog.findMany({
    where: { companyId: id },
    orderBy: { timestamp: "desc" },
    take,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return json(
    logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userId: l.userId,
      userName: l.user?.name ?? null,
      userEmail: l.user?.email ?? null,
      timestamp: l.timestamp.toISOString(),
    })),
  );
});
