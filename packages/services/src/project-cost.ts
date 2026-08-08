import { prisma, type ProjectCostType } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postProjectCost, reverseJournalEntry } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Project Cost Service — labour, overhead, equipment, contractor, permit costs.
 * These feed into the cost-per-sqft allocation (unlike Expenses, which are operational).
 */

interface AddProjectCostInput {
  projectId: string;
  costType: ProjectCostType;
  amount: Decimal | number | string;
  date?: Date;
  vendor?: string;
  subcontractorId?: string;
  notes?: string;
  receiptUrl?: string;
  userId?: string;
}

export async function addProjectCost(input: AddProjectCostInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Cost amount must be > 0");

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    const cost = await tx.projectCost.create({
      data: {
        projectId: input.projectId,
        costType: input.costType,
        amount,
        date: input.date ?? new Date(),
        vendor: input.vendor,
        subcontractorId: input.subcontractorId,
        notes: input.notes,
        receiptUrl: input.receiptUrl,
      },
    });

    // Trigger reallocation — project cost changed → costPerSqft changes
    await reallocateProjectCosts(tx, input.projectId);

    // Post to the General Ledger: capitalise the cost into WIP, credit cash.
    await postProjectCost(tx, {
      companyId: project.companyId,
      projectCostId: cost.id,
      projectId: input.projectId,
      amount,
      postedById: input.userId,
    });

    await logAction(tx, {
      userId: input.userId,
      action: "PROJECT_COST_ADD",
      entityType: "ProjectCost",
      entityId: cost.id,
      after: { projectId: input.projectId, costType: input.costType, amount },
    });
    return cost;
  });
}

export async function deleteProjectCost(costId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const cost = await tx.projectCost.findUnique({ where: { id: costId } });
    if (!cost) throw new ServiceError("Project cost not found", 404);

    // Find and reverse the original GL entry before deleting the cost row
    const originalEntry = await tx.journalEntry.findFirst({
      where: { sourceType: "PROJECT_COST", sourceId: costId },
    });
    if (originalEntry) {
      await reverseJournalEntry(tx, originalEntry.id, {
        postedById: userId,
        memo: `Reversal: project cost deleted (${cost.costType})`,
      });
    }

    await tx.projectCost.delete({ where: { id: costId } });

    // Trigger reallocation — cost removed → costPerSqft changes
    await reallocateProjectCosts(tx, cost.projectId);

    await logAction(tx, {
      userId,
      action: "PROJECT_COST_DELETE",
      entityType: "ProjectCost",
      entityId: costId,
      before: { projectId: cost.projectId, costType: cost.costType, amount: cost.amount },
    });
    return { deleted: true, projectId: cost.projectId };
  });
}
