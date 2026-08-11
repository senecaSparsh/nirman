import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction } from "./stock-ledger";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postScrapGeneration } from "./gl-posting";

/**
 * Scrap / "Create" Material Generation Service.
 *
 * Internally generated material (e.g. cut-piece scrap from fabrication,
 * by-products of a manufacturing process) is added to stock at a scrap
 * valuation — typically lower than the purchased material's MAC.
 *
 * This is an IN movement (SCRAP_GENERATED) with a user-specified unit cost.
 * The MAC at the destination location is recalculated using the standard
 * weighted-average formula.
 *
 * Each generation gets a slip number (SG-YYMMDD-NNNN) and creates a
 * ScrapGeneration + ScrapGenerationLine audit record.
 */

/** Generate a unique scrap generation number: SG-YYMMDD-NNNN */
async function generateScrapNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `SG-${ymd}-`;
  const existing = await tx.scrapGeneration.findMany({
    where: { scrapNumber: { startsWith: prefix } },
    select: { scrapNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.scrapNumber?.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateScrapGenerationInput {
  companyId: string;
  toLocationId: string;
  sourceMaterialId?: string;
  projectId?: string;
  notes?: string;
  createdById?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    unitCost: Decimal | number | string; // scrap valuation
  }[];
}

export async function createScrapGeneration(input: CreateScrapGenerationInput) {
  if (input.lines.length === 0) throw new ServiceError("Scrap generation must have at least one line");

  // Validate location belongs to the company
  const location = await prisma.stockLocation.findFirst({
    where: { id: input.toLocationId, companyId: input.companyId, deletedAt: null },
  });
  if (!location) throw new ServiceError("Destination location not found", 404);

  // Validate materials exist
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new ServiceError("One or more materials not found or deleted", 404);
  }

  // Validate source material if provided
  if (input.sourceMaterialId) {
    const sourceMaterial = await prisma.material.findFirst({
      where: { id: input.sourceMaterialId, deletedAt: null },
    });
    if (!sourceMaterial) throw new ServiceError("Source material not found", 404);
  }

  // Validate project if provided
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId },
    });
    if (!project) throw new ServiceError("Project not found", 404);
  }

  // Validate line data
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Scrap line qty must be > 0");
    if (new Decimal(line.unitCost).lt(0)) throw new ServiceError("Scrap line unit cost must be ≥ 0");
  }

  return withStockTransaction(async (tx) => {
    const scrapNumber = await generateScrapNumber(tx);

    // Create the ScrapGeneration record FIRST so we have the ID to pass
    // directly to recordMovement — avoids the broad updateMany that could
    // link unrelated orphaned movements (race condition fix, EC-2.6).
    const scrap = await tx.scrapGeneration.create({
      data: {
        scrapNumber,
        companyId: input.companyId,
        toLocationId: input.toLocationId,
        sourceMaterialId: input.sourceMaterialId,
        projectId: input.projectId,
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    // Record stock movements for each line, linked directly via refId
    const lineResults: { materialId: string; qty: Decimal; unitCost: Decimal; lineTotal: Decimal }[] = [];
    let totalValue = new Decimal(0);

    for (const line of input.lines) {
      const result = await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "SCRAP_GENERATED",
        toLocationId: input.toLocationId,
        qty: new Decimal(line.qty),
        unitCost: new Decimal(line.unitCost),
        reason: input.notes ?? "Scrap / created material generation",
        refType: "SCRAP_GENERATION",
        refId: scrap.id,
        userId: input.createdById,
      });

      const lineTotal = new Decimal(line.qty).times(new Decimal(line.unitCost));
      totalValue = totalValue.plus(lineTotal);
      lineResults.push({
        materialId: line.materialId,
        qty: new Decimal(line.qty),
        unitCost: new Decimal(line.unitCost),
        lineTotal,
      });
    }

    // Create the scrap generation lines (after movements, so the stock
    // ledger is already updated — same pattern as the DPR auto-scrap path).
    await tx.scrapGenerationLine.createMany({
      data: lineResults.map((l) => ({
        scrapGenerationId: scrap.id,
        materialId: l.materialId,
        qty: l.qty,
        unitCost: l.unitCost,
      })),
    });

    // Post the GL entry — Dr Inventory / Cr WIP (project) or Cr Operating Expense (standalone)
    await postScrapGeneration(tx, {
      companyId: input.companyId,
      scrapGenerationId: scrap.id,
      projectId: input.projectId,
      totalValue,
      postedById: input.createdById,
    });

    await logAction(tx, {
      userId: input.createdById,
      action: "SCRAP_GENERATION_CREATE",
      entityType: "ScrapGeneration",
      entityId: scrap.id,
      after: {
        scrapNumber,
        toLocationId: input.toLocationId,
        lineCount: lineResults.length,
        totalValue: totalValue.toString(),
      },
    });

    // Re-fetch with includes for the return value
    return tx.scrapGeneration.findUniqueOrThrow({
      where: { id: scrap.id },
      include: {
        lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
        toLocation: { select: { name: true } },
      },
    });
  });
}

/** Get a list of scrap generations for a company */
export async function listScrapGenerations(companyId: string, dateRange?: { from?: Date; to?: Date }) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateRange?.from) dateFilter.gte = dateRange.from;
  if (dateRange?.to) dateFilter.lte = dateRange.to;

  return prisma.scrapGeneration.findMany({
    where: {
      companyId,
      generationDate: dateFilter,
    },
    include: {
      lines: {
        include: { material: { select: { code: true, name: true, unit: true } } },
      },
      toLocation: { select: { name: true } },
      project: { select: { name: true } },
      sourceMaterial: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { generationDate: "desc" },
  });
}

/** Get a single scrap generation by ID */
export async function getScrapGeneration(id: string, companyId?: string) {
  const scrap = await prisma.scrapGeneration.findUnique({
    where: { id },
    include: {
      lines: {
        include: { material: { select: { code: true, name: true, unit: true } } },
      },
      toLocation: { select: { name: true } },
      project: { select: { name: true } },
      sourceMaterial: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!scrap) throw new ServiceError("Scrap generation not found", 404);
  if (companyId && scrap.companyId !== companyId) throw new ServiceError("Scrap generation not found", 404);
  return scrap;
}
