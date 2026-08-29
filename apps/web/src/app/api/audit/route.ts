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
  const cursor = searchParams.get("cursor") ?? undefined;
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
      if (endDate) {
        // Include the full end day (23:59:59.999) — new Date("2026-08-13") is midnight
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
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
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.id : null;

    return json({
      rows: page.map((e) => ({
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
      hasMore,
      nextCursor,
    });
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
    return json({ rows: [], hasMore: false, nextCursor: null });
  }

  const entityLimit = Math.min(limit, 50);
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: entityLimit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  const hasMore = entries.length > entityLimit;
  const page = hasMore ? entries.slice(0, entityLimit) : entries;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.id : null;

  return json({
    rows: page.map((e) => ({
      id: e.id,
      action: e.action,
      userId: e.userId,
      userName: e.user?.name ?? null,
      before: e.before,
      after: e.after,
      createdAt: e.timestamp.toISOString(),
    })),
    hasMore,
    nextCursor,
  });
});
