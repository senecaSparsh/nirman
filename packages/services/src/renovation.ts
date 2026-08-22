import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { postRenovationCost, postRenovationCapitalization } from "./gl-posting";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { ServiceError } from "./errors";

/**
 * Renovation / Value-Add Service — track enhancement work on existing
 * built units or land parcels.
 *
 * Lifecycle: PLANNED → IN_PROGRESS → COMPLETED (or CANCELLED)
 *
 * Costs are tracked via RenovationCost entries. On completion:
 *  - Capitalised costs (RENOVATION/ADDITION/VALUE_ADD) update the asset's
 *    cost basis: unit.productionCost += actualCost
 *  - The asset's currentValuation is updated (auto = original + actualCost,
 *    or manually set)
 *  - ROI is calculated: (newValuation - originalValuation - actualCost) / actualCost
 *
 * REPAIR type costs are expensed (not capitalised).
 */

async function generateRenovationNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `REN-${ymd}-`;
  const count = await tx.renovationProject.count({ where: { renovationNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export interface CreateRenovationInput {
  companyId: string;
  projectId: string;
  type: "RENOVATION" | "ADDITION" | "VALUE_ADD" | "REPAIR";
  title: string;
  description?: string;
  builtUnitId?: string;
  landParcelId?: string;
  budget?: Decimal | number | string;
  startDate?: Date;
  userId?: string;
}

export async function createRenovation(input: CreateRenovationInput) {
  if (!input.builtUnitId && !input.landParcelId) {
    throw new ServiceError("Either builtUnitId or landParcelId is required");
  }
  if (input.builtUnitId && input.landParcelId) {
    throw new ServiceError("Cannot link renovation to both a built unit and a land parcel");
  }

  return prisma.$transaction(async (tx) => {
    // Validate project
    const project = await tx.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found", 404);

    // Validate asset + snapshot its current valuation
    let originalValuation = new Decimal(0);
    if (input.builtUnitId) {
      const unit = await tx.builtUnit.findUnique({ where: { id: input.builtUnitId } });
      if (!unit) throw new ServiceError("Built unit not found", 404);
      if (unit.deletedAt) throw new ServiceError("Built unit is deleted");
      if (unit.status === "SOLD") throw new ServiceError("Cannot renovate a SOLD unit");
      originalValuation = new Decimal(unit.currentValuation);
    } else if (input.landParcelId) {
      const parcel = await tx.landParcel.findUnique({ where: { id: input.landParcelId } });
      if (!parcel) throw new ServiceError("Land parcel not found", 404);
      if (parcel.deletedAt) throw new ServiceError("Land parcel is deleted");
      if (parcel.status === "SOLD") throw new ServiceError("Cannot renovate a SOLD parcel");
      originalValuation = new Decimal(parcel.currentValuation);
    }

    const renovation = await tx.renovationProject.create({
      data: {
        renovationNumber: await generateRenovationNumber(tx),
        type: input.type,
        status: "PLANNED",
        builtUnitId: input.builtUnitId ?? null,
        landParcelId: input.landParcelId ?? null,
        projectId: input.projectId,
        companyId: input.companyId,
        title: input.title,
        description: input.description ?? null,
        budget: input.budget ? new Decimal(input.budget) : new Decimal(0),
        originalValuation,
        startDate: input.startDate ?? null,
        createdById: input.userId,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENOVATION_CREATE",
        entityType: "RenovationProject",
        entityId: renovation.id,
        after: { renovationNumber: renovation.renovationNumber, title: renovation.title, type: renovation.type },
      });
    }

    return renovation;
  }, { isolationLevel: "Serializable" });
}

export async function startRenovation(id: string, userId?: string) {
  const renovation = await prisma.renovationProject.findUnique({ where: { id } });
  if (!renovation) throw new ServiceError("Renovation project not found", 404);
  if (renovation.status !== "PLANNED") throw new ServiceError(`Cannot start renovation in status ${renovation.status}`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.renovationProject.update({
      where: { id },
      data: { status: "IN_PROGRESS", startDate: renovation.startDate ?? new Date() },
    });
    if (userId) {
      await logAction(tx, {
        userId,
        action: "RENOVATION_START",
        entityType: "RenovationProject",
        entityId: id,
        before: { status: renovation.status },
        after: { status: "IN_PROGRESS" },
      });
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

export interface AddRenovationCostInput {
  renovationProjectId: string;
  costType: "LABOUR" | "OVERHEAD" | "EQUIPMENT" | "CONTRACTOR" | "PERMIT" | "TRANSFER_DUTY" | "OTHER";
  amount: Decimal | number | string;
  vendor?: string;
  notes?: string;
  receiptUrl?: string;
  userId?: string;
}

export async function addRenovationCost(input: AddRenovationCostInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");

  return prisma.$transaction(async (tx) => {
    const renovation = await tx.renovationProject.findUnique({
      where: { id: input.renovationProjectId },
    });
    if (!renovation) throw new ServiceError("Renovation project not found", 404);
    if (renovation.status === "COMPLETED") throw new ServiceError("Cannot add costs to a completed renovation");
    if (renovation.status === "CANCELLED") throw new ServiceError("Cannot add costs to a cancelled renovation");

    // REPAIR costs are expensed; all others are capitalised
    const capitalise = renovation.type !== "REPAIR";

    const cost = await tx.renovationCost.create({
      data: {
        renovationProjectId: renovation.id,
        costType: input.costType,
        amount,
        vendor: input.vendor,
        notes: input.notes,
        receiptUrl: input.receiptUrl,
        createdById: input.userId,
      },
    });

    // Update actualCost on the renovation
    const newActualCost = new Decimal(renovation.actualCost).plus(amount);
    if (renovation.budget && newActualCost.gt(renovation.budget)) {
      throw new ServiceError(`Cost exceeds renovation budget: ${newActualCost.toFixed(2)} > ${renovation.budget}`);
    }
    await tx.renovationProject.update({
      where: { id: renovation.id },
      data: { actualCost: newActualCost },
    });

    // Post to GL
    await postRenovationCost(tx, {
      companyId: renovation.companyId,
      renovationCostId: cost.id,
      renovationProjectId: renovation.id,
      projectId: renovation.projectId,
      amount,
      capitalise,
      postedById: input.userId,
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENOVATION_COST_ADD",
        entityType: "RenovationProject",
        entityId: renovation.id,
        after: { costType: input.costType, amount: amount.toString(), capitalise },
      });
    }

    return cost;
  }, { isolationLevel: "Serializable" });
}

export async function deleteRenovationCost(costId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const cost = await tx.renovationCost.findUnique({
      where: { id: costId },
      include: { renovationProject: true },
    });
    if (!cost) throw new ServiceError("Renovation cost not found", 404);
    if (cost.renovationProject.status === "COMPLETED") {
      throw new ServiceError("Cannot delete cost from a completed renovation");
    }

    // Reverse GL entry
    const je = await tx.journalEntry.findFirst({
      where: { sourceId: cost.id, sourceType: "RENOVATION_COST" },
    });
    if (je) {
      const lines = await tx.journalLine.findMany({ where: { journalEntryId: je.id } });
      await tx.journalEntry.create({
        data: {
          entryNumber: `${je.entryNumber}-REV`,
          sourceType: "RENOVATION_COST_REVERSAL",
          sourceId: je.sourceId,
          memo: `Reversal of ${je.memo}`,
          companyId: je.companyId,
          postedById: userId,
          status: "POSTED",
          totalDebit: je.totalCredit,
          totalCredit: je.totalDebit,
          lines: {
            create: lines.map((l) => ({
              accountCode: l.accountCode,
              debit: l.credit,
              credit: l.debit,
              entityType: l.entityType,
              entityId: l.entityId,
            })),
          },
        },
      });
    }

    // Update actualCost
    const newActualCost = new Decimal(cost.renovationProject.actualCost).minus(cost.amount);
    await tx.renovationProject.update({
      where: { id: cost.renovationProjectId },
      data: { actualCost: newActualCost },
    });

    await tx.renovationCost.delete({ where: { id: costId } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RENOVATION_COST_DELETE",
        entityType: "RenovationProject",
        entityId: cost.renovationProjectId,
        before: { costType: cost.costType, amount: cost.amount.toString() },
      });
    }
  });
}

export async function completeRenovation(
  id: string,
  opts: { newValuation?: Decimal | number | string; userId?: string },
) {
  const result = await prisma.$transaction(async (tx) => {
    const renovation = await tx.renovationProject.findUnique({
      where: { id },
      include: { builtUnit: true, landParcel: true },
    });
    if (!renovation) throw new ServiceError("Renovation project not found", 404);
    if (renovation.status !== "IN_PROGRESS") {
      throw new ServiceError(`Cannot complete renovation in status ${renovation.status}. Must be IN_PROGRESS.`);
    }

    const actualCost = new Decimal(renovation.actualCost);
    const originalValuation = new Decimal(renovation.originalValuation);

    // Determine new valuation: manual input or auto = original + capitalised cost
    const isRepair = renovation.type === "REPAIR";
    const capitalisedCost = isRepair ? new Decimal(0) : actualCost;
    const newValuation = opts.newValuation
      ? new Decimal(opts.newValuation)
      : originalValuation.plus(capitalisedCost);

    // Update the asset's cost basis + valuation
    if (renovation.builtUnitId && renovation.builtUnit) {
      const newProductionCost = new Decimal(renovation.builtUnit.productionCost).plus(capitalisedCost);
      await tx.builtUnit.update({
        where: { id: renovation.builtUnitId },
        data: {
          productionCost: newProductionCost,
          currentValuation: newValuation,
        },
      });
    } else if (renovation.landParcelId && renovation.landParcel) {
      const newAcquisitionCost = new Decimal(renovation.landParcel.acquisitionCost).plus(capitalisedCost);
      await tx.landParcel.update({
        where: { id: renovation.landParcelId },
        data: {
          acquisitionCost: newAcquisitionCost,
          currentValuation: newValuation,
        },
      });
    }

    const updated = await tx.renovationProject.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        newValuation,
      },
    });

    // Post GL capitalization entry: move capitalised cost from WIP to the
    // permanent asset account (LAND_ASSET or UNIT_ASSET). REPAIR costs were
    // already expensed via postRenovationCost() — no capitalization needed.
    if (!isRepair && capitalisedCost.gt(0)) {
      // Determine companyId from the renovation's project or the asset itself
      let companyId: string | null = null;
      if (renovation.projectId) {
        const project = await tx.project.findUnique({
          where: { id: renovation.projectId },
          select: { companyId: true },
        });
        companyId = project?.companyId ?? null;
      }
      if (!companyId && renovation.landParcelId) {
        const lp = await tx.landPurchase.findFirst({
          where: { parcels: { some: { id: renovation.landParcelId } } },
          select: { companyId: true },
        });
        companyId = lp?.companyId ?? null;
      }
      if (!companyId && renovation.builtUnitId) {
        const unit = await tx.builtUnit.findUnique({
          where: { id: renovation.builtUnitId },
          select: { project: { select: { companyId: true } } },
        });
        companyId = unit?.project?.companyId ?? null;
      }
      if (companyId) {
        await postRenovationCapitalization(tx, {
          companyId,
          renovationProjectId: id,
          assetType: renovation.landParcelId ? "LAND" : "BUILT_UNIT",
          assetId: renovation.landParcelId ?? renovation.builtUnitId!,
          projectId: renovation.projectId,
          amount: capitalisedCost,
          postedById: opts.userId,
        });
      }
    }

    // Reallocate project costs so cost-per-sqft reflects the capitalised
    // renovation cost across all sellable units in the project.
    if (renovation.projectId && !isRepair) {
      await reallocateProjectCosts(tx, renovation.projectId);
    }

    // ROI = (newValuation - originalValuation - actualCost) / actualCost
    const roi = actualCost.gt(0)
      ? newValuation.minus(originalValuation).minus(actualCost).div(actualCost).times(100)
      : new Decimal(0);

    if (opts.userId) {
      await logAction(tx, {
        userId: opts.userId,
        action: "RENOVATION_COMPLETE",
        entityType: "RenovationProject",
        entityId: id,
        before: { status: renovation.status },
        after: {
          status: "COMPLETED",
          actualCost: actualCost.toString(),
          originalValuation: originalValuation.toString(),
          newValuation: newValuation.toString(),
          roi: roi.toFixed(2) + "%",
        },
      });
    }

    return { renovation: updated, roi, actualCost, newValuation, companyId: renovation.companyId };
  }, { isolationLevel: "Serializable" });

  void emitNotificationEvent({
    eventType: NotificationEventType.RENOVATION_COMPLETED,
    companyId: result.companyId,
    entityType: "RenovationProject",
    entityId: id,
    variables: {
      actualCost: result.actualCost.toString(),
      newValuation: result.newValuation.toString(),
      roi: result.roi.toFixed(2),
    },
    timestamp: new Date(),
  });

  return { renovation: result.renovation, roi: result.roi };
}

export async function cancelRenovation(id: string, userId?: string) {
  const renovation = await prisma.renovationProject.findUnique({ where: { id } });
  if (!renovation) throw new ServiceError("Renovation project not found", 404);
  if (renovation.status === "COMPLETED") throw new ServiceError("Cannot cancel a completed renovation");

  return prisma.$transaction(async (tx) => {
    // Reverse all posted RENOVATION_COST GL entries for this renovation.
    // Each cost was posted via postRenovationCost() (Dr WIP/Expense, Cr Cash).
    // We reverse them so the books don't carry orphan WIP/expense for a
    // cancelled renovation.
    const costs = await tx.renovationCost.findMany({
      where: { renovationProjectId: id },
      select: { id: true },
    });
    for (const cost of costs) {
      const je = await tx.journalEntry.findFirst({
        where: { sourceId: cost.id, sourceType: "RENOVATION_COST" },
      });
      if (je) {
        const lines = await tx.journalLine.findMany({ where: { journalEntryId: je.id } });
        await tx.journalEntry.create({
          data: {
            entryNumber: `${je.entryNumber}-REV`,
            sourceType: "RENOVATION_COST_REVERSAL",
            sourceId: je.sourceId,
            memo: `Reversal of ${je.memo} (renovation cancelled)`,
            companyId: je.companyId,
            postedById: userId,
            status: "POSTED",
            totalDebit: je.totalCredit,
            totalCredit: je.totalDebit,
            lines: {
              create: lines.map((l) => ({
                accountCode: l.accountCode,
                debit: l.credit,
                credit: l.debit,
                entityType: l.entityType,
                entityId: l.entityId,
              })),
            },
          },
        });
      }
    }

    const updated = await tx.renovationProject.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    if (userId) {
      await logAction(tx, {
        userId,
        action: "RENOVATION_CANCEL",
        entityType: "RenovationProject",
        entityId: id,
        before: { status: renovation.status },
        after: { status: "CANCELLED", costsReversed: costs.length },
      });
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

/** Compute ROI for a completed renovation. */
export function computeRoi(
  originalValuation: Decimal | number | string,
  newValuation: Decimal | number | string,
  actualCost: Decimal | number | string,
): Decimal {
  const cost = new Decimal(actualCost);
  if (cost.lte(0)) return new Decimal(0);
  return new Decimal(newValuation)
    .minus(new Decimal(originalValuation))
    .minus(cost)
    .div(cost)
    .times(100);
}
