import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { reallocateProjectCosts } from "./valuation";
import { postProjectCost, reverseJournalEntry } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Legal Documents Service — permissions, licenses, NOCs, certificates,
 * and agreements to sell attached to land purchases and/or projects.
 *
 * Each document has a type (LAND_SANCTION, BUILDING_PERMISSION, FIRE_NOC,
 * POLLUTION_NOC, COMPLETION_CERTIFICATE, FUNCTIONAL_CERTIFICATE,
 * OCCUPANCY_CERTIFICATE, AGREEMENT_TO_SELL, BUDGET_APPROVAL, OTHER), a
 * status (PENDING, APPROVED, REJECTED, EXPIRED, RENEWAL_DUE), an issuing
 * authority, validity dates, an optional proof file upload, and an
 * optional amount (fee paid or ATS registration amount).
 *
 * Documents can be linked to a land purchase, a project, or both.
 *
 * Transfer Duty bridge: when a TRANSFER_DUTY legal doc is marked obtained
 * with an amount and is linked to a project, a matching ProjectCost line
 * (costType = TRANSFER_DUTY) is auto-created/updated so the duty flows
 * into the project's cost-per-sqft and the General Ledger. The cost line
 * is linked back to the legal doc via sourceLegalDocId.
 */

export interface CreateLegalDocInput {
  companyId: string;
  landPurchaseId?: string;
  projectId?: string;
  type: string;
  title: string;
  authority?: string;
  status?: string;
  appliesTo?: string;
  docNumber?: string;
  sortOrder?: number;
  prerequisiteType?: string | null;
  obtained?: boolean;
  applicationDate?: Date | null;
  issueDate?: Date | null;
  validFrom?: Date | null;
  validTill?: Date | null;
  amount?: number | null;
  expectedRegistryDate?: Date | null;
  documentUrl?: string | null;
  documentName?: string | null;
  notes?: string | null;
  userId?: string;
}

export interface UpdateLegalDocInput {
  type?: string;
  title?: string;
  authority?: string | null;
  status?: string;
  appliesTo?: string;
  docNumber?: string | null;
  sortOrder?: number;
  prerequisiteType?: string | null;
  obtained?: boolean;
  applicationDate?: Date | null;
  issueDate?: Date | null;
  validFrom?: Date | null;
  validTill?: Date | null;
  amount?: number | null;
  expectedRegistryDate?: Date | null;
  documentUrl?: string | null;
  documentName?: string | null;
  notes?: string | null;
}

/**
 * Create a legal document. Validates that at least one of landPurchaseId
 * or projectId is provided, and that the referenced entity belongs to the
 * same company.
 */
export async function createLegalDoc(input: CreateLegalDocInput) {
  if (!input.landPurchaseId && !input.projectId) {
    throw new ServiceError("A legal document must be linked to a land purchase or a project");
  }

  // Validate ownership
  if (input.landPurchaseId) {
    const lp = await prisma.landPurchase.findFirst({
      where: { id: input.landPurchaseId, companyId: input.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!lp) throw new ServiceError("Land purchase not found");
  }
  if (input.projectId) {
    const p = await prisma.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!p) throw new ServiceError("Project not found");
  }

  return prisma.$transaction(async (tx) => {
    const doc = await tx.legalDocument.create({
      data: {
        companyId: input.companyId,
        landPurchaseId: input.landPurchaseId ?? null,
        projectId: input.projectId ?? null,
        type: input.type as never,
        title: input.title,
        authority: input.authority ?? null,
        status: (input.status ?? "NOT_REQUIRED") as never,
        appliesTo: (input.appliesTo ?? "BOTH") as never,
        docNumber: input.docNumber ?? null,
        sortOrder: input.sortOrder ?? 0,
        prerequisiteType: (input.prerequisiteType ?? null) as never,
        obtained: input.obtained ?? false,
        applicationDate: input.applicationDate ?? null,
        issueDate: input.issueDate ?? null,
        validFrom: input.validFrom ?? null,
        validTill: input.validTill ?? null,
        amount: input.amount ?? null,
        expectedRegistryDate: input.expectedRegistryDate ?? null,
        documentUrl: input.documentUrl ?? null,
        documentName: input.documentName ?? null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });

    // Transfer Duty → ProjectCost bridge
    await syncTransferDutyCost(tx, doc, input.userId);

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEGAL_DOC_CREATE",
        entityType: "LegalDocument",
        entityId: doc.id,
        after: {
          type: doc.type, title: doc.title, status: doc.status,
          landPurchaseId: doc.landPurchaseId, projectId: doc.projectId,
        },
      });
    }

    return doc;
  });
}

/**
 * Update a legal document. Only fields that are provided will be updated.
 */
export async function updateLegalDoc(id: string, companyId: string, input: UpdateLegalDocInput, userId?: string) {
  const existing = await prisma.legalDocument.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!existing) throw new ServiceError("Legal document not found");

  const data: Record<string, unknown> = {};
  if (input.type !== undefined) data.type = input.type;
  if (input.title !== undefined) data.title = input.title;
  if (input.authority !== undefined) data.authority = input.authority;
  if (input.status !== undefined) data.status = input.status;
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.docNumber !== undefined) data.docNumber = input.docNumber;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.prerequisiteType !== undefined) data.prerequisiteType = input.prerequisiteType as never;
  if (input.obtained !== undefined) data.obtained = input.obtained;
  if (input.applicationDate !== undefined) data.applicationDate = input.applicationDate;
  if (input.issueDate !== undefined) data.issueDate = input.issueDate;
  if (input.validFrom !== undefined) data.validFrom = input.validFrom;
  if (input.validTill !== undefined) data.validTill = input.validTill;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.expectedRegistryDate !== undefined) data.expectedRegistryDate = input.expectedRegistryDate;
  if (input.documentUrl !== undefined) data.documentUrl = input.documentUrl;
  if (input.documentName !== undefined) data.documentName = input.documentName;
  if (input.notes !== undefined) data.notes = input.notes;

  return prisma.$transaction(async (tx) => {
    const doc = await tx.legalDocument.update({
      where: { id },
      data,
    });

    // Transfer Duty → ProjectCost bridge (create / update / remove)
    await syncTransferDutyCost(tx, doc, userId);

    if (userId) {
      await logAction(tx, {
        userId,
        companyId,
        action: "LEGAL_DOC_UPDATE",
        entityType: "LegalDocument",
        entityId: doc.id,
        before: { type: existing.type, title: existing.title, status: existing.status },
        after: { type: doc.type, title: doc.title, status: doc.status },
      });
    }

    return doc;
  });
}

/**
 * Soft-delete a legal document. Also removes any linked ProjectCost line.
 */
export async function deleteLegalDoc(id: string, companyId: string, userId?: string) {
  const existing = await prisma.legalDocument.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!existing) throw new ServiceError("Legal document not found");

  await prisma.$transaction(async (tx) => {
    // Remove the linked transfer-duty cost line first (reverses GL entry).
    await removeLinkedTransferDutyCost(tx, id, userId);

    await tx.legalDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId,
        action: "LEGAL_DOC_DELETE",
        entityType: "LegalDocument",
        entityId: id,
        before: { type: existing.type, title: existing.title },
      });
    }
  });

  return { ok: true };
}

/**
 * List legal documents for a land purchase or project.
 * Ordered by sortOrder (guided flow sequence), then by createdAt.
 */
export async function listLegalDocs(companyId: string, filter: { landPurchaseId?: string; projectId?: string }) {
  const where: Record<string, unknown> = { companyId, deletedAt: null };
  if (filter.landPurchaseId) where.landPurchaseId = filter.landPurchaseId;
  if (filter.projectId) where.projectId = filter.projectId;

  return prisma.legalDocument.findMany({
    where: where as never,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * List ALL legal documents for a company (for the /permissions overview page).
 * Optionally filter by type, status, or appliesTo.
 */
export async function listAllLegalDocs(
  companyId: string,
  filter?: { type?: string; status?: string; appliesTo?: string },
) {
  const where: Record<string, unknown> = { companyId, deletedAt: null };
  if (filter?.type) where.type = filter.type;
  if (filter?.status) where.status = filter.status;
  if (filter?.appliesTo) where.appliesTo = filter.appliesTo;

  return prisma.legalDocument.findMany({
    where: where as never,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, name: true } },
      landPurchase: { select: { id: true, sellerName: true, location: true } },
    },
  });
}

// ─── Transfer Duty → ProjectCost bridge ─────────────────────────────

/**
 * Sync a linked ProjectCost (TRANSFER_DUTY) for a TRANSFER_DUTY legal doc.
 *
 * Rules:
 *  - If the doc is TRANSFER_DUTY, obtained=true, status=APPROVED, has an
 *    amount > 0, AND is linked to a project → create or update a
 *    ProjectCost line (costType=TRANSFER_DUTY, sourceLegalDocId=doc.id).
 *  - If any of those conditions are no longer met → remove the existing
 *    linked cost line (reverses the GL entry).
 *  - Idempotent: re-runs on every create/update, upserts by sourceLegalDocId.
 */
async function syncTransferDutyCost(
  tx: Parameters<Parameters<typeof prisma["$transaction"]>[0]>[0],
  doc: { id: string; type: string; obtained: boolean; status: string; amount: Decimal | number | null; projectId: string | null; title: string; docNumber: string | null },
  userId?: string,
) {
  const isTransferDuty = doc.type === "TRANSFER_DUTY";
  const shouldHaveCost =
    isTransferDuty &&
    doc.obtained &&
    doc.status === "APPROVED" &&
    doc.amount != null &&
    new Decimal(doc.amount).gt(0) &&
    doc.projectId != null;

  // Find any existing linked cost line
  const existingCost = await tx.projectCost.findFirst({
    where: { sourceLegalDocId: doc.id },
  });

  if (shouldHaveCost && doc.projectId) {
    const amount = new Decimal(doc.amount as Decimal | number);
    if (existingCost) {
      // Update amount if changed
      if (!existingCost.amount.equals(amount)) {
        await tx.projectCost.update({
          where: { id: existingCost.id },
          data: { amount },
        });
        await reallocateProjectCosts(tx, doc.projectId);
      }
    } else {
      // Create new cost line + post to GL + reallocate
      const cost = await tx.projectCost.create({
        data: {
          projectId: doc.projectId,
          costType: "TRANSFER_DUTY" as never,
          amount,
          date: new Date(),
          vendor: "Authority (Transfer Duty)",
          notes: `Transfer duty / unearned increase — ${doc.title}${doc.docNumber ? ` (${doc.docNumber})` : ""}`,
          sourceLegalDocId: doc.id,
        },
      });
      const project = await tx.project.findFirst({
        where: { id: doc.projectId },
        select: { companyId: true },
      });
      if (project) {
        await postProjectCost(tx, {
          companyId: project.companyId,
          projectCostId: cost.id,
          projectId: doc.projectId,
          amount,
          postedById: userId,
        });
        await reallocateProjectCosts(tx, doc.projectId);
      }
    }
  } else if (existingCost) {
    // Conditions no longer met — remove the linked cost line
    await removeLinkedTransferDutyCost(tx, doc.id, userId, existingCost.id);
  }
}

/**
 * Remove a linked transfer-duty ProjectCost line and reverse its GL entry.
 */
async function removeLinkedTransferDutyCost(
  tx: Parameters<Parameters<typeof prisma["$transaction"]>[0]>[0],
  legalDocId: string,
  userId?: string,
  costId?: string,
) {
  const cost = costId
    ? await tx.projectCost.findUnique({ where: { id: costId } })
    : await tx.projectCost.findFirst({ where: { sourceLegalDocId: legalDocId } });
  if (!cost) return;

  // Reverse the original GL entry
  const originalEntry = await tx.journalEntry.findFirst({
    where: { sourceType: "PROJECT_COST", sourceId: cost.id },
  });
  if (originalEntry) {
    await reverseJournalEntry(tx, originalEntry.id, {
      postedById: userId,
      memo: `Reversal: transfer duty legal doc removed/updated`,
    });
  }

  await tx.projectCost.delete({ where: { id: cost.id } });
  await reallocateProjectCosts(tx, cost.projectId);
}
