import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { recordMovement, withStockTransaction } from "./stock-ledger";
import { postScrapGeneration } from "./gl-posting";

/**
 * Standard Consumption Benchmark Service.
 *
 * Defines how much of a material SHOULD be consumed for a given type of
 * construction work (e.g. 1.5 t steel per 100 sqft of foundation). These
 * benchmarks are used by the auto-scrap detection logic during DPR
 * submission: if actual consumption exceeds the standard, the delta is
 * auto-flagged as generated scrap.
 */

export interface CreateStandardConsumptionInput {
  companyId: string;
  workType: string;
  materialId: string;
  standardQty: Decimal | number | string;
  baseQty?: Decimal | number | string; // the "per N" divisor (default 1)
  unitOfMeasure: string;
  notes?: string;
  userId?: string;
}

export async function createStandardConsumption(input: CreateStandardConsumptionInput) {
  const qty = new Decimal(input.standardQty);
  if (!qty.gt(0)) throw new ServiceError("Standard qty must be > 0");
  if (!input.workType.trim()) throw new ServiceError("Work type is required");
  if (!input.unitOfMeasure.trim()) throw new ServiceError("Unit of measure is required");
  const baseQty = new Decimal(input.baseQty ?? 1);
  if (!baseQty.gt(0)) throw new ServiceError("Base qty must be > 0");

  // Check for duplicate
  const existing = await prisma.standardConsumption.findUnique({
    where: {
      companyId_workType_materialId: {
        companyId: input.companyId,
        workType: input.workType.trim(),
        materialId: input.materialId,
      },
    },
  });
  if (existing) throw new ServiceError("A benchmark for this work type + material already exists");

  const sc = await prisma.standardConsumption.create({
    data: {
      companyId: input.companyId,
      workType: input.workType.trim(),
      materialId: input.materialId,
      standardQty: qty,
      baseQty,
      unitOfMeasure: input.unitOfMeasure.trim(),
      notes: input.notes ?? null,
    },
    include: { material: { select: { code: true, name: true, unit: true } } },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "STANDARD_CONSUMPTION_CREATE",
      entityType: "StandardConsumption",
      entityId: sc.id,
      after: { workType: sc.workType, materialId: sc.materialId, standardQty: sc.standardQty.toString() },
    });
  }

  return sc;
}

export async function updateStandardConsumption(
  id: string,
  input: {
    workType?: string;
    materialId?: string;
    standardQty?: Decimal | number | string;
    baseQty?: Decimal | number | string;
    unitOfMeasure?: string;
    notes?: string | null;
  },
  userId?: string,
) {
  const existing = await prisma.standardConsumption.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("Standard consumption benchmark not found", 404);

  const data: Prisma.StandardConsumptionUpdateInput = {};
  if (input.workType !== undefined) data.workType = input.workType.trim();
  if (input.materialId !== undefined) data.material = { connect: { id: input.materialId } };
  if (input.standardQty !== undefined) {
    const qty = new Decimal(input.standardQty);
    if (!qty.gt(0)) throw new ServiceError("Standard qty must be > 0");
    data.standardQty = qty;
  }
  if (input.baseQty !== undefined) {
    const baseQty = new Decimal(input.baseQty);
    if (!baseQty.gt(0)) throw new ServiceError("Base qty must be > 0");
    data.baseQty = baseQty;
  }
  if (input.unitOfMeasure !== undefined) data.unitOfMeasure = input.unitOfMeasure.trim();
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  const sc = await prisma.standardConsumption.update({
    where: { id },
    data,
    include: { material: { select: { code: true, name: true, unit: true } } },
  });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "STANDARD_CONSUMPTION_UPDATE",
      entityType: "StandardConsumption",
      entityId: id,
      after: { workType: sc.workType, standardQty: sc.standardQty.toString() },
    });
  }

  return sc;
}

export async function deleteStandardConsumption(id: string, userId?: string) {
  const existing = await prisma.standardConsumption.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("Standard consumption benchmark not found", 404);

  await prisma.standardConsumption.delete({ where: { id } });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "STANDARD_CONSUMPTION_DELETE",
      entityType: "StandardConsumption",
      entityId: id,
      before: { workType: existing.workType, materialId: existing.materialId },
    });
  }

  return { deleted: true };
}

export async function listStandardConsumptions(companyId: string, workType?: string) {
  return prisma.standardConsumption.findMany({
    where: {
      companyId,
      ...(workType ? { workType } : {}),
    },
    include: {
      material: { select: { code: true, name: true, unit: true } },
    },
    orderBy: [{ workType: "asc" }, { material: { name: "asc" } }],
  });
}

/** Get all distinct work types for a company (for dropdowns/filtering) */
export async function listWorkTypes(companyId: string): Promise<string[]> {
  const results = await prisma.standardConsumption.findMany({
    where: { companyId },
    select: { workType: true },
    distinct: ["workType"],
    orderBy: { workType: "asc" },
  });
  return results.map((r) => r.workType);
}

// ── Variance Calculation ──────────────────────────────────

export interface ConsumptionVariance {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  actualQty: Decimal;
  standardQty: Decimal;
  variance: Decimal; // actual - standard (positive = over-consumption = potential scrap)
  variancePct: Decimal; // (actual - standard) / standard × 100
  isOverConsumption: boolean;
}

/**
 * Compare actual material consumption (from a DPR) against standard
 * consumption benchmarks for a given work type.
 *
 * The benchmark `standardQty` is defined "per `baseQty` units of work"
 * (e.g. 1.5 t steel per 100 sqft). The actual standard for a given DPR
 * is scaled by the work quantity recorded on that DPR:
 *
 *   scaledStandard = standardQty × (workQty / baseQty)
 *
 * So if the benchmark is 1.5 t per 100 sqft and the DPR records 500 sqft
 * of foundation, the scaled standard is 1.5 × (500/100) = 7.5 t. If the
 * DPR consumed 8 t, the variance is +0.5 t (over-consumption = scrap).
 *
 * @param companyId - the company scope
 * @param workType - the type of construction work (e.g. "Foundation")
 * @param actualLines - array of { materialId, qty } from the DPR
 * @param workQty - the quantity of work done in this DPR (e.g. 500 sqft)
 * @returns array of variances per material that has a benchmark
 */
export async function calculateConsumptionVariance(
  companyId: string,
  workType: string,
  actualLines: { materialId: string; qty: Decimal | number | string }[],
  workQty?: Decimal | number | string | null,
): Promise<ConsumptionVariance[]> {
  const benchmarks = await prisma.standardConsumption.findMany({
    where: { companyId, workType },
    include: { material: { select: { code: true, name: true, unit: true } } },
  });

  if (benchmarks.length === 0) return [];

  // The work-quantity multiplier: workQty / baseQty. Defaults to 1
  // (i.e. standardQty is used as-is) when workQty is not provided.
  const workQtyDec = workQty != null ? new Decimal(workQty) : null;

  const benchmarkMap = new Map(benchmarks.map((b) => [b.materialId, b]));

  const variances: ConsumptionVariance[] = [];

  for (const line of actualLines) {
    const benchmark = benchmarkMap.get(line.materialId);
    if (!benchmark) continue; // no benchmark for this material

    const actualQty = new Decimal(line.qty);

    // Scale the standard by the work quantity.
    // If workQty is provided, scaledStandard = standardQty × (workQty / baseQty)
    // Otherwise, use standardQty directly (backwards-compatible).
    let standardQty: Decimal;
    if (workQtyDec != null && workQtyDec.gt(0) && benchmark.baseQty.gt(0)) {
      standardQty = benchmark.standardQty.times(workQtyDec).dividedBy(benchmark.baseQty);
    } else {
      standardQty = benchmark.standardQty;
    }

    const variance = actualQty.minus(standardQty);
    const variancePct = standardQty.gt(0)
      ? variance.dividedBy(standardQty).times(100)
      : new Decimal(0);

    variances.push({
      materialId: line.materialId,
      materialCode: benchmark.material.code,
      materialName: benchmark.material.name,
      unit: benchmark.material.unit,
      actualQty,
      standardQty,
      variance,
      variancePct,
      isOverConsumption: variance.gt(0),
    });
  }

  return variances;
}

// ── DPR Variance Analysis + Auto-Scrap ─────────────────────

export interface DprVarianceResult {
  dprId: string;
  workType: string;
  variances: ConsumptionVariance[];
  overConsumptionLines: { materialId: string; materialName: string; materialCode: string; unit: string; scrapQty: Decimal }[];
  scrapGenerationId: string | null;
}

/**
 * Run variance analysis on a submitted DPR and optionally auto-generate
 * scrap for over-consumption deltas.
 *
 * This is the "brain" described in the SRS transcript: compare actual
 * material consumption (from DPR lines) against standard consumption
 * benchmarks for the DPR's work type. If actual > standard, the delta
 * is auto-flagged as generated scrap.
 *
 * @param dprId - the DPR to analyze
 * @param options.companyId - if provided, verify the DPR belongs to this company
 * @param options.autoGenerateScrap - if true, create a ScrapGeneration for over-consumption
 * @param options.scrapToLocationId - where to stock the auto-generated scrap (required if autoGenerateScrap)
 * @param options.scrapValuationPct - scrap valuation as % of issue cost (default 50)
 * @param options.userId - for audit logging
 */
export async function runDprVarianceAnalysis(
  dprId: string,
  options?: {
    companyId?: string;
    autoGenerateScrap?: boolean;
    scrapToLocationId?: string;
    scrapValuationPct?: Decimal | number | string;
    userId?: string;
  },
): Promise<DprVarianceResult> {
  const dpr = await prisma.dailyProgressReport.findUnique({
    where: { id: dprId },
    include: {
      materialLines: {
        include: { material: { select: { code: true, name: true, unit: true } } },
      },
    },
  });

  if (!dpr) throw new ServiceError("DPR not found", 404);
  if (options?.companyId && dpr.companyId !== options.companyId) {
    throw new ServiceError("DPR not found", 404);
  }
  if (!dpr.workType) {
    return {
      dprId,
      workType: "",
      variances: [],
      overConsumptionLines: [],
      scrapGenerationId: null,
    };
  }

  const variances = await calculateConsumptionVariance(
    dpr.companyId,
    dpr.workType,
    dpr.materialLines.map((l) => ({ materialId: l.materialId, qty: l.qty })),
    dpr.workQty,
  );

  // Store variance analysis on the DPR
  const varianceJson = variances.map((v) => ({
    materialId: v.materialId,
    materialCode: v.materialCode,
    materialName: v.materialName,
    unit: v.unit,
    actualQty: v.actualQty.toString(),
    standardQty: v.standardQty.toString(),
    variance: v.variance.toString(),
    variancePct: v.variancePct.toString(),
    isOverConsumption: v.isOverConsumption,
  }));

  await prisma.dailyProgressReport.update({
    where: { id: dprId },
    data: { varianceAnalysis: varianceJson },
  });

  // Identify over-consumption lines (potential scrap)
  const overConsumptionLines = variances
    .filter((v) => v.isOverConsumption)
    .map((v) => ({
      materialId: v.materialId,
      materialName: v.materialName,
      materialCode: v.materialCode,
      unit: v.unit,
      scrapQty: v.variance, // the delta is the scrap
    }));

  let scrapGenerationId: string | null = null;

  // Auto-generate scrap if requested and there's over-consumption
  if (options?.autoGenerateScrap && overConsumptionLines.length > 0 && options.scrapToLocationId) {
    // Scrap valuation: % of the DPR line's actual issue cost (default 50%)
    const valuationPct = new Decimal(options.scrapValuationPct ?? 50).dividedBy(100);

    // Generate a scrap number
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const prefix = `SG-${ymd}-`;

    scrapGenerationId = await withStockTransaction(async (tx) => {
      // Generate scrap number
      const existing = await tx.scrapGeneration.findMany({
        where: { scrapNumber: { startsWith: prefix } },
        select: { scrapNumber: true },
      });
      const maxSeq = existing.reduce((max, e) => {
        const n = parseInt(e.scrapNumber?.slice(prefix.length) ?? "0", 10);
        return n > max ? n : max;
      }, 0);
      const scrapNumber = `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;

      // Build a lookup of DPR line unit costs for scrap valuation
      const lineCostMap = new Map(
        dpr.materialLines.map((ml) => [ml.materialId, ml.unitCost]),
      );

      // Create the ScrapGeneration record first (without lines) so we have
      // the ID to pass directly to recordMovement — avoids the broad
      // updateMany that could link unrelated orphaned movements.
      const scrap = await tx.scrapGeneration.create({
        data: {
          scrapNumber,
          companyId: dpr.companyId,
          toLocationId: options.scrapToLocationId!,
          projectId: dpr.projectId,
          notes: `Auto-generated from DPR variance analysis (work type: ${dpr.workType})`,
          createdById: options.userId,
        },
      });

      // Record stock movements for each over-consumption line, linked
      // directly to the scrap generation via refId.
      for (const line of overConsumptionLines) {
        const issueCost = lineCostMap.get(line.materialId);
        const scrapUnitCost = issueCost
          ? new Decimal(issueCost).times(valuationPct)
          : new Decimal(0);

        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "SCRAP_GENERATED",
          toLocationId: options.scrapToLocationId!,
          qty: line.scrapQty,
          unitCost: scrapUnitCost,
          reason: `Auto-detected over-consumption from DPR ${dpr.workType} (${dpr.date.toISOString().slice(0, 10)})`,
          refType: "SCRAP_GENERATION",
          refId: scrap.id,
          userId: options.userId,
        });
      }

      // Now create the scrap generation lines (after movements, so the
      // stock ledger is already updated).
      await tx.scrapGenerationLine.createMany({
        data: overConsumptionLines.map((l) => {
          const issueCost = lineCostMap.get(l.materialId);
          const scrapUnitCost = issueCost
            ? new Decimal(issueCost).times(valuationPct)
            : new Decimal(0);
          return {
            scrapGenerationId: scrap.id,
            materialId: l.materialId,
            qty: l.scrapQty,
            unitCost: scrapUnitCost,
          };
        }),
      });

      // Post the GL entry — Dr Inventory / Cr WIP (project-linked) or Cr Operating Expense (standalone)
      // This ensures the DPR auto-scrap path has the same GL posting as manual scrap generation.
      const scrapTotalValue = overConsumptionLines.reduce((sum, l) => {
        const issueCost = lineCostMap.get(l.materialId);
        const scrapUnitCost = issueCost
          ? new Decimal(issueCost).times(valuationPct)
          : new Decimal(0);
        return sum.plus(new Decimal(l.scrapQty).times(scrapUnitCost));
      }, new Decimal(0));

      await postScrapGeneration(tx, {
        companyId: dpr.companyId,
        scrapGenerationId: scrap.id,
        projectId: dpr.projectId ?? undefined,
        totalValue: scrapTotalValue,
        postedById: options.userId,
      });

      // Update DPR with the scrap generation link
      await tx.dailyProgressReport.update({
        where: { id: dprId },
        data: { autoScrapGenerationId: scrap.id },
      });

      await logAction(tx, {
        userId: options.userId,
        action: "DPR_AUTO_SCRAP_GENERATED",
        entityType: "ScrapGeneration",
        entityId: scrap.id,
        after: {
          dprId,
          workType: dpr.workType,
          overConsumptionLines: overConsumptionLines.length,
          totalScrapQty: overConsumptionLines.map((l) => `${l.materialCode}: ${l.scrapQty} ${l.unit}`).join(", "),
        },
      });

      return scrap.id;
    });
  }

  return {
    dprId,
    workType: dpr.workType,
    variances,
    overConsumptionLines,
    scrapGenerationId,
  };
}
