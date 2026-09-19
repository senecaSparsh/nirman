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

export const ATTACHMENT_ENTITY_ACCESS: Record<string, { perm: string; model: string; soft?: boolean; companyPath?: string | string[] }> = {
  Employee:            { perm: PERM.HR_VIEW,          model: "Employee", soft: true },
  Project:             { perm: PERM.PROJECTS_VIEW,    model: "Project", soft: true },
  DailyProgressReport: { perm: PERM.DPR_VIEW,         model: "DailyProgressReport" },
  PurchaseOrder:       { perm: PERM.PROCUREMENT_VIEW, model: "PurchaseOrder" },
  MaterialRequisition: { perm: PERM.PROCUREMENT_VIEW, model: "MaterialRequisition" },
  Supplier:            { perm: PERM.PROCUREMENT_VIEW, model: "Supplier", soft: true },
  Material:            { perm: PERM.INVENTORY_VIEW,   model: "Material", soft: true },
  MaterialIssue:       { perm: PERM.INVENTORY_VIEW,   model: "MaterialIssue" },
  MaterialSale:        { perm: PERM.INVENTORY_VIEW,   model: "MaterialSale" },
  ScrapGeneration:     { perm: PERM.INVENTORY_VIEW,   model: "ScrapGeneration" },
  // StockCount + StockTransfer carry no companyId — they bind through
  // locations (a transfer is visible when EITHER end is this company's,
  // since inter-company STOs exist).
  StockCount:          { perm: PERM.INVENTORY_VIEW,   model: "StockCount", companyPath: "location" },
  StockTransfer:       { perm: PERM.INVENTORY_VIEW,   model: "StockTransfer", companyPath: ["fromLocation", "toLocation"] },
  Equipment:           { perm: PERM.VEHICLE_VIEW,     model: "Equipment", soft: true },
  GatePass:            { perm: PERM.GATE_PASS_VIEW,   model: "GatePass" },
  Expense:             { perm: PERM.FINANCE_VIEW,     model: "Expense" },
  ExpenseClaim:        { perm: PERM.FINANCE_VIEW,     model: "ExpenseClaim" },
  LandPurchase:        { perm: PERM.ASSETS_VIEW,      model: "LandPurchase", soft: true },
  AssetSale:           { perm: PERM.SALES_VIEW,       model: "AssetSale" },
  Customer:            { perm: PERM.SALES_VIEW,       model: "Customer", soft: true },
  Tenancy:             { perm: PERM.RENTALS_VIEW,     model: "Tenancy" },
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
): Promise<{ error: string; status: number } | null> {
  const rule = ATTACHMENT_ENTITY_ACCESS[entityType];
  if (!rule) return { error: "Unsupported attachment target", status: 403 };
  await requirePermission(rule.perm);
  const delegate = (prisma as unknown as Record<string, SubjectDelegate>)[
    rule.model.charAt(0).toLowerCase() + rule.model.slice(1)
  ];
  if (!delegate) return { error: "Unsupported attachment target", status: 403 };
  const paths = rule.companyPath ? (Array.isArray(rule.companyPath) ? rule.companyPath : [rule.companyPath]) : null;
  const subject = await delegate.findFirst({
    where: {
      id: entityId,
      ...(paths
        ? paths.length === 1
          ? { [paths[0]!]: { companyId } }
          : { OR: paths.map((p) => ({ [p]: { companyId } })) }
        : { companyId }),
      ...(rule.soft ? { deletedAt: null } : {}),
      // Relationally-scoped models (companyPath) aren't in the scope
      // registry — the path IS their tenant binding.
      ...(paths ? {} : await scopeWhere(rule.model)),
    },
    select: { id: true },
  });
  if (!subject) return { error: "Record not found", status: 404 };
  return null;
}
