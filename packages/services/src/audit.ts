import { prisma, type Prisma } from "@nirman/db";

/**
 * Cache of userIds known to exist in the DB (or known to be invalid).
 * Avoids a round-trip on every logAction call after the first hit.
 * Keyed by userId; value = true (exists) | false (does not exist).
 */
const userExistsCache = new Map<string, boolean>();

/**
 * Validate that a userId exists in the User table. Returns the userId if it
 * exists, or null if it doesn't (or if it's the synthetic "dev" id used in
 * AUTH_BYPASS mode). This prevents FK constraint violations on AuditLog.
 *
 * Results are cached per-process to avoid repeated DB lookups.
 */
async function resolveUserId(tx: Prisma.TransactionClient, userId?: string): Promise<string | null> {
  if (!userId) return null;

  // The synthetic dev user never exists in the DB — skip the lookup.
  if (userId === "dev") return null;

  const cached = userExistsCache.get(userId);
  if (cached !== undefined) return cached ? userId : null;

  // Use the transaction client if possible, but fall back to the shared
  // prisma instance — this lookup is outside the mutation's atomic scope
  // and only serves as a guard, so a dirty read is acceptable.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  const exists = user !== null;
  userExistsCache.set(userId, exists);
  return exists ? userId : null;
}

/**
 * Audit Service — immutable audit log for sensitive actions.
 * Every create/update/delete on key entities should log the before/after state.
 *
 * If the provided userId doesn't exist in the User table (e.g. the synthetic
 * "dev" user in AUTH_BYPASS mode, or a stale session), the audit entry is
 * logged with userId = null instead of throwing an FK constraint violation.
 * This ensures audit logging never crashes a mutation transaction.
 */
export async function logAction(tx: Prisma.TransactionClient, entry: {
  userId?: string;
  action: string; // e.g. "PURCHASE_ORDER_CREATE", "LAND_PARTITION", "ASSET_SALE"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const safeUserId = await resolveUserId(tx, entry.userId);
  await tx.auditLog.create({
    data: {
      userId: safeUserId,
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
