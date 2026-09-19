/**
 * Per-model company-scoping for backup/export.
 *
 * Most models have a direct `companyId` column + `createdAt` — they use the
 * default `{ where: { companyId }, orderBy: { createdAt: "asc" } }`. But many
 * models are scoped through a relation (project, location, landPurchase,
 * assignedTo) and/or don't have `createdAt` (auditLog uses `timestamp`).
 *
 * Before this map, the backup routes queried every model with
 * `where: { companyId }` + `orderBy: { createdAt }` — Prisma rejected the
 * unknown-argument errors, the try/catch silently swallowed them, and the
 * backup was INCOMPLETE (empty arrays for stockTransfer, stockCount,
 * projectCost, wbsNode, boqItem, measurementBookEntry, task, landParcel,
 * stockLocationItem, stockMovement, materialIssue) while flooding the logs
 * with `prisma:error Unknown argument companyId` on every cron run.
 *
 * This map provides the correct relation-based where-clause and sort field
 * for each non-default model. Models not listed here use the default
 * `{ where: { companyId }, orderBy: { createdAt: "asc" } }`.
 */
export type PrismaWhere = Record<string, unknown>;

/** Models that need a non-default where-clause for company scoping. */
export const BACKUP_MODEL_SCOPE: Record<string, PrismaWhere> = {
  // Company IS the company — filter by id, not companyId
  company: { id: "__COMPANY_ID__" },

  // Scoped through landPurchase
  landParcel: { landPurchase: { companyId: "__COMPANY_ID__" } },

  // Scoped through stock location
  stockTransfer: { fromLocation: { companyId: "__COMPANY_ID__" } },
  stockCount: { location: { companyId: "__COMPANY_ID__" } },
  stockLocationItem: { location: { companyId: "__COMPANY_ID__" } },

  // Scoped through material
  stockMovement: { material: { companyId: "__COMPANY_ID__" } },

  // Scoped through project OR department (exactly one is set per row)
  materialIssue: {
    OR: [
      { project: { companyId: "__COMPANY_ID__" } },
      { department: { companyId: "__COMPANY_ID__" } },
    ],
  },

  // Scoped through project (projectId is optional — null-project rows
  // belong to no company and are correctly excluded)
  materialRequisition: { project: { companyId: "__COMPANY_ID__" } },

  // Scoped through project
  projectCost: { project: { companyId: "__COMPANY_ID__" } },
  wbsNode: { project: { companyId: "__COMPANY_ID__" } },
  boqItem: { project: { companyId: "__COMPANY_ID__" } },
  measurementBookEntry: { project: { companyId: "__COMPANY_ID__" } },

  // Scoped through assignee's company membership (relation is "memberships")
  task: { assignedTo: { memberships: { some: { companyId: "__COMPANY_ID__" } } } },
};

/** Models that need a non-default orderBy field. */
export const BACKUP_MODEL_ORDER_BY: Record<string, Record<string, "asc" | "desc">> = {
  // AuditLog uses `timestamp`, not `createdAt`
  auditLog: { timestamp: "asc" },
  // StockLocationItem has `updatedAt` but no `createdAt`
  stockLocationItem: { updatedAt: "asc" },
  // StockMovement uses `timestamp`, not `createdAt`
  stockMovement: { timestamp: "asc" },
};

/**
 * Build the where-clause for a model, substituting the real companyId
 * for the `__COMPANY_ID__` placeholder.
 */
export function backupWhere(model: string, companyId: string): PrismaWhere {
  const template = BACKUP_MODEL_SCOPE[model];
  if (!template) return { companyId };
  return JSON.parse(JSON.stringify(template).replace(/"__COMPANY_ID__"/g, JSON.stringify(companyId)));
}

/**
 * Build the orderBy-clause for a model. Defaults to `{ createdAt: "asc" }`.
 */
export function backupOrderBy(model: string): Record<string, "asc" | "desc"> {
  return BACKUP_MODEL_ORDER_BY[model] ?? { createdAt: "asc" };
}
