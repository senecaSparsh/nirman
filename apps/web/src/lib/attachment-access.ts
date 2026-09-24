/**
 * Per-entity subject access for the generic attachments endpoints. The
 * routes are entity-agnostic, so the subject row's own visibility rules
 * must be re-checked here: the caller needs the module's view permission
 * AND the row must sit inside their scope (for Employee, scopeWhere carries
 * the H1 wall — an owner's offer letter is not listable by a field worker).
 * `soft` marks models that carry deletedAt; the rest hard-delete or lack it.
 */
import { prisma } from "@nirman/db";
import { requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const ATTACHMENT_ENTITY_ACCESS: Record<string, { perm: string; managePerm?: string; model: string; soft?: boolean; companyPath?: string | string[]; keepScope?: boolean }> = {
  Employee:            { perm: PERM.HR_VIEW,          managePerm: PERM.HR_MANAGE,          model: "Employee", soft: true },
  Project:             { perm: PERM.PROJECTS_VIEW,    managePerm: PERM.PROJECTS_MANAGE,    model: "Project", soft: true },
  DailyProgressReport: { perm: PERM.DPR_VIEW,         managePerm: PERM.DPR_SUBMIT,         model: "DailyProgressReport" },
  PurchaseOrder:       { perm: PERM.PROCUREMENT_VIEW, managePerm: PERM.PROCUREMENT_MANAGE, model: "PurchaseOrder" },
  // MaterialRequisition + MaterialIssue carry no companyId — the tenant
  // binding goes through project OR department. Unlike StockCount/Transfer
  // they DO sit in the scope registry (projectId/departmentId FKs), so
  // scopeWhere must still apply on top of the tenant path.
  MaterialRequisition: { perm: PERM.PROCUREMENT_VIEW, managePerm: PERM.PROCUREMENT_MANAGE, model: "MaterialRequisition", companyPath: ["project", "department"], keepScope: true },
  MaterialIssue:       { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "MaterialIssue",       companyPath: ["project", "department"], keepScope: true },
  Supplier:            { perm: PERM.PROCUREMENT_VIEW, managePerm: PERM.PROCUREMENT_MANAGE, model: "Supplier", soft: true },
  Material:            { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "Material", soft: true },
  MaterialSale:        { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "MaterialSale" },
  ScrapGeneration:     { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "ScrapGeneration" },
  // StockCount + StockTransfer carry no companyId — they bind through
  // locations (a transfer is visible when EITHER end is this company's,
  // since inter-company STOs exist).
  StockCount:          { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "StockCount", companyPath: "location" },
  StockTransfer:       { perm: PERM.INVENTORY_VIEW,   managePerm: PERM.INVENTORY_MANAGE,   model: "StockTransfer", companyPath: ["fromLocation", "toLocation"] },
  Equipment:           { perm: PERM.VEHICLE_VIEW,     managePerm: PERM.VEHICLE_MANAGE,     model: "Equipment", soft: true },
  GatePass:            { perm: PERM.GATE_PASS_VIEW,   managePerm: PERM.GATE_PASS_MANAGE,   model: "GatePass" },
  Expense:             { perm: PERM.FINANCE_VIEW,     managePerm: PERM.FINANCE_MANAGE,     model: "Expense" },
  ExpenseClaim:        { perm: PERM.FINANCE_VIEW,     managePerm: PERM.FINANCE_MANAGE,     model: "ExpenseClaim" },
  LandPurchase:        { perm: PERM.ASSETS_VIEW,      managePerm: PERM.ASSETS_MANAGE,      model: "LandPurchase", soft: true },
  AssetSale:           { perm: PERM.SALES_VIEW,       managePerm: PERM.SALES_MANAGE,       model: "AssetSale" },
  Customer:            { perm: PERM.SALES_VIEW,       managePerm: PERM.SALES_MANAGE,       model: "Customer", soft: true },
  Tenancy:             { perm: PERM.RENTALS_VIEW,     managePerm: PERM.RENTALS_MANAGE,     model: "Tenancy" },
};

type SubjectDelegate = {
  findFirst: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<unknown>;
};

/**
 * Verify the caller may see attachments on this subject: module permission
 * + the row visible in the caller's scope. Fail-closed — an unregistered
 * entityType is rejected rather than trusted.
 */
export async function assertAttachmentSubjectAccess(
  entityType: string,
  entityId: string,
  companyId: string,
  opts?: { perm?: string },
): Promise<{ error: string; status: number } | null> {
  const rule = ATTACHMENT_ENTITY_ACCESS[entityType];
  if (!rule) return { error: "Unsupported attachment target", status: 403 };
  // Write checks may substitute the entity's manage perm — a manager can
  // always see records they manage, and view perm is implied by manage in
  // every built-in role anyway.
  await requirePermission(opts?.perm ?? rule.perm);
  const delegate = (prisma as unknown as Record<string, SubjectDelegate>)[
    rule.model.charAt(0).toLowerCase() + rule.model.slice(1)
  ];
  if (!delegate) return { error: "Unsupported attachment target", status: 403 };
  const paths = rule.companyPath ? (Array.isArray(rule.companyPath) ? rule.companyPath : [rule.companyPath]) : null;
  const tenantClause = paths
    ? paths.length === 1
      ? { [paths[0]!]: { companyId } }
      : { OR: paths.map((p) => ({ [p]: { companyId } })) }
    : { companyId };
  // Relationally-scoped models (companyPath) aren't in the scope registry —
  // the path IS their tenant binding. keepScope models (project/department-FK
  // entities like MaterialRequisition) ARE registered, so their per-project
  // scoping still applies on top. AND them: scopeWhere may return its own
  // OR, which a spread would silently overwrite.
  const scopeClause = !paths || rule.keepScope ? await scopeWhere(rule.model) : {};
  const subject = await delegate.findFirst({
    where: {
      id: entityId,
      AND: [tenantClause, scopeClause, ...(rule.soft ? [{ deletedAt: null }] : [])],
    },
    select: { id: true },
  });
  if (!subject) return { error: "Record not found", status: 404 };
  return null;
}
