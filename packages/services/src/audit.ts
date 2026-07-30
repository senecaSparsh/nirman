import { prisma, type Prisma } from "@nirman/db";

/**
 * Audit Service — immutable audit log for sensitive actions.
 * Every create/update/delete on key entities should log the before/after state.
 */

export async function logAction(tx: Prisma.TransactionClient, entry: {
  userId?: string;
  action: string; // e.g. "PURCHASE_ORDER_CREATE", "LAND_PARTITION", "ASSET_SALE"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before as any,
      after: entry.after as any,
    },
  });
}

/**
 * Fetch audit trail for a specific entity.
 */
export async function getAuditTrail(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { timestamp: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
}
