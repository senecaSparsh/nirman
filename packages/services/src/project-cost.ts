import { prisma, type ProjectCostType } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";

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
  notes?: string;
  receiptUrl?: string;
}

export async function addProjectCost(input: AddProjectCostInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new Error("Cost amount must be > 0");

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new Error("Project not found or deleted");

    const cost = await tx.projectCost.create({
      data: {
        projectId: input.projectId,
        costType: input.costType,
        amount,
        date: input.date ?? new Date(),
        vendor: input.vendor,
        notes: input.notes,
        receiptUrl: input.receiptUrl,
      },
    });

    // Trigger reallocation — project cost changed → costPerSqft changes
    await reallocateProjectCosts(tx, input.projectId);

    return cost;
  });
}

export async function deleteProjectCost(costId: string) {
  return prisma.$transaction(async (tx) => {
    const cost = await tx.projectCost.findUnique({ where: { id: costId } });
    if (!cost) throw new Error("Project cost not found");

    await tx.projectCost.delete({ where: { id: costId } });

    // Trigger reallocation — cost removed → costPerSqft changes
    await reallocateProjectCosts(tx, cost.projectId);

    return { deleted: true, projectId: cost.projectId };
  });
}
