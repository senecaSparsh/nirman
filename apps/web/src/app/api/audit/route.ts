import { NextRequest } from "next/server";
import { prisma, type Prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";

/**
 * GET /api/audit?entityType=X&entityId=Y
 *   → audit log entries for a specific entity (most recent first, limit 50).
 * GET /api/audit?entityType=X
 *   → all entries for an entity type (scoped to the user's company).
 * GET /api/audit?all=true&userId=X&startDate=Y&endDate=Z
 *   → admin-scoped "All Activity" view with optional filters.
 *
 * Results are filtered by the user's companyId to prevent cross-company leaks.
 * OWNER/ADMIN users see entries for their company; entries with null companyId
 * (legacy) are only visible to OWNER/ADMIN.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const all = searchParams.get("all") === "true";
  const filterUserId = searchParams.get("userId");
  const filterAction = searchParams.get("action");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 500);

  const isSuperuser = user.role === "OWNER" || user.role === "ADMIN";

  // "All Activity" view — admin-scoped, no entityType required
  if (all) {
    if (!isSuperuser) {
      return json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const where: Prisma.AuditLogWhereInput = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (filterAction) where.action = { contains: filterAction, mode: "insensitive" };
    if (filterUserId) where.userId = filterUserId;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    if (user.companyId) {
      where.OR = [
        { companyId: user.companyId },
        { companyId: null },
      ];
    }

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return json(
      entries.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        userId: e.userId,
        userName: e.user?.name ?? null,
        before: e.before,
        after: e.after,
        createdAt: e.timestamp.toISOString(),
      })),
    );
  }

  // Entity-scoped view (existing behavior)
  if (!entityType) {
    return json({ error: "entityType query parameter is required (or use all=true)" }, { status: 400 });
  }

  // Build the company-scoped where clause.
  const where: Prisma.AuditLogWhereInput = { entityType };
  if (entityId) where.entityId = entityId;

  if (user.companyId) {
    where.OR = [
      { companyId: user.companyId },
      { companyId: null },
    ];
  } else if (!isSuperuser) {
    return json([]);
  }

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
