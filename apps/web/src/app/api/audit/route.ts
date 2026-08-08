import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";

/**
 * GET /api/audit?entityType=X&entityId=Y
 *   → audit log entries for a specific entity (most recent first, limit 50).
 * GET /api/audit?entityType=X
 *   → all entries for an entity type (optional, for lists).
 *
 * Any authenticated user can view audit logs.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType) {
    return json({ error: "entityType query parameter is required" }, { status: 400 });
  }

  const where: { entityType: string; entityId?: string } = { entityType };
  if (entityId) where.entityId = entityId;

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return json(
    entries.map((e) => ({
      id: e.id,
      action: e.action,
      userId: e.userId,
      userName: e.user?.name ?? null,
      before: e.before,
      after: e.after,
      createdAt: e.timestamp.toISOString(),
    })),
  );
});
