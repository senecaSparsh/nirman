import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Rate Analysis Service — the cost breakdown of a BOQ line item's rate.
 *
 * A BOQ line item has a "rate" (₹ per unit of work). Rate Analysis justifies
 * how that rate was derived by breaking it into components:
 *
 *   MATERIAL    — cement, sand, steel, bricks (qty per unit × rate per unit)
 *   LABOUR      — mason, helper, carpenter (hours/days per unit × rate)
 *   EQUIPMENT   — mixer, crane, vibrator (hours per unit × rate)
 *   OVERHEAD    — % of (material + labour + equipment) subtotal
 *   PROFIT      — % of (material + labour + equipment + overhead) subtotal
 *   OTHER       — transport, taxes, contingencies (flat amount or %)
 *
 * The computed total from all lines = the rate per unit of BOQ work.
 * The service can optionally auto-update the BoqItem.rate from this total.
 *
 * Wastage: a wastagePct on the RateAnalysis inflates MATERIAL line quantities
 * to account for expected material wastage (e.g. 5% extra cement). The
 * inflated amount is what gets summed into the total.
 */

// ── Types ──────────────────────────────────────────────────

export type ComponentType =
  | "MATERIAL"
  | "LABOUR"
  | "EQUIPMENT"
  | "OVERHEAD"
  | "PROFIT"
  | "OTHER";

export type LineBasis = "QUANTITY" | "PERCENTAGE";

export interface RateAnalysisLineInput {
  id?: string; // present when editing existing line
  componentType: ComponentType;
  basis?: LineBasis;
  materialId?: string | null;
  description: string;
  quantity?: Decimal | number | string | null;
  unit?: string | null;
  rate?: Decimal | number | string | null;
  percentage?: Decimal | number | string | null;
  sortOrder?: number;
}

export interface CreateRateAnalysisInput {
  boqItemId: string;
  perUnit: string;
  wastagePct?: Decimal | number | string;
  notes?: string | null;
  lines: RateAnalysisLineInput[];
  /** If true, auto-update BoqItem.rate with the computed total. */
  updateBoqRate?: boolean;
  userId?: string;
}

export interface UpdateRateAnalysisInput {
  perUnit?: string;
  wastagePct?: Decimal | number | string;
  notes?: string | null;
  lines?: RateAnalysisLineInput[];
  updateBoqRate?: boolean;
  userId?: string;
}

// ── Pure computation ───────────────────────────────────────

export interface ComputedLine {
  amount: Decimal;
  base: Decimal; // the subtotal this line was computed from (for % lines)
}

export interface RateAnalysisComputation {
  lines: Array<RateAnalysisLineInput & ComputedLine>;
  materialSubtotal: Decimal;
  labourSubtotal: Decimal;
  equipmentSubtotal: Decimal;
  directSubtotal: Decimal; // material + labour + equipment
  overheadSubtotal: Decimal;
  profitSubtotal: Decimal;
  otherSubtotal: Decimal;
  totalRate: Decimal;
}

/**
 * Compute the rate analysis totals from a set of line inputs.
 *
 * The computation follows this order:
 * 1. MATERIAL lines: amount = qty × rate × (1 + wastagePct/100)
 * 2. LABOUR lines: amount = qty × rate
 * 3. EQUIPMENT lines: amount = qty × rate
 * 4. directSubtotal = material + labour + equipment
 * 5. OVERHEAD lines (PERCENTAGE): amount = percentage × directSubtotal / 100
 * 6. overheadSubtotal = sum of overhead lines
 * 7. PROFIT lines (PERCENTAGE): amount = percentage × (directSubtotal + overheadSubtotal) / 100
 * 8. profitSubtotal = sum of profit lines
 * 9. OTHER lines: QUANTITY basis = qty × rate; PERCENTAGE basis = % × (direct + overhead + profit) / 100
 * 10. otherSubtotal = sum of other lines
 * 11. totalRate = directSubtotal + overheadSubtotal + profitSubtotal + otherSubtotal
 *
 * This is the standard Indian construction industry rate analysis formula.
 */
export function computeRateAnalysis(
  lines: RateAnalysisLineInput[],
  wastagePct: Decimal | number | string = 0,
): RateAnalysisComputation {
  const wastage = new Decimal(wastagePct || 0);
  const wastageMultiplier = new Decimal(1).plus(wastage.div(100));

  // Phase 1: compute direct cost lines (MATERIAL, LABOUR, EQUIPMENT)
  const computedLines: Array<RateAnalysisLineInput & ComputedLine> = [];
  let materialSubtotal = new Decimal(0);
  let labourSubtotal = new Decimal(0);
  let equipmentSubtotal = new Decimal(0);

  for (const line of lines) {
    if (line.componentType === "MATERIAL" || line.componentType === "LABOUR" || line.componentType === "EQUIPMENT") {
      const qty = line.quantity != null ? new Decimal(line.quantity) : new Decimal(0);
      const rate = line.rate != null ? new Decimal(line.rate) : new Decimal(0);
      let amount = qty.times(rate);
      if (line.componentType === "MATERIAL") {
        amount = amount.times(wastageMultiplier);
        materialSubtotal = materialSubtotal.plus(amount);
      } else if (line.componentType === "LABOUR") {
        labourSubtotal = labourSubtotal.plus(amount);
      } else {
        equipmentSubtotal = equipmentSubtotal.plus(amount);
      }
      computedLines.push({ ...line, amount: amount.toDecimalPlaces(2), base: new Decimal(0) });
    }
  }

  const directSubtotal = materialSubtotal.plus(labourSubtotal).plus(equipmentSubtotal);

  // Phase 2: OVERHEAD lines (% of directSubtotal)
  let overheadSubtotal = new Decimal(0);
  for (const line of lines) {
    if (line.componentType === "OVERHEAD") {
      const pct = line.percentage != null ? new Decimal(line.percentage) : new Decimal(0);
      const amount = directSubtotal.times(pct).div(100);
      overheadSubtotal = overheadSubtotal.plus(amount);
      computedLines.push({ ...line, amount: amount.toDecimalPlaces(2), base: directSubtotal });
    }
  }

  // Phase 3: PROFIT lines (% of directSubtotal + overheadSubtotal)
  const profitBase = directSubtotal.plus(overheadSubtotal);
  let profitSubtotal = new Decimal(0);
  for (const line of lines) {
    if (line.componentType === "PROFIT") {
      const pct = line.percentage != null ? new Decimal(line.percentage) : new Decimal(0);
      const amount = profitBase.times(pct).div(100);
      profitSubtotal = profitSubtotal.plus(amount);
      computedLines.push({ ...line, amount: amount.toDecimalPlaces(2), base: profitBase });
    }
  }

  // Phase 4: OTHER lines (QUANTITY or PERCENTAGE)
  const otherBase = directSubtotal.plus(overheadSubtotal).plus(profitSubtotal);
  let otherSubtotal = new Decimal(0);
  for (const line of lines) {
    if (line.componentType === "OTHER") {
      const basis = line.basis ?? "QUANTITY";
      let amount: Decimal;
      let base: Decimal;
      if (basis === "PERCENTAGE") {
        const pct = line.percentage != null ? new Decimal(line.percentage) : new Decimal(0);
        amount = otherBase.times(pct).div(100);
        base = otherBase;
      } else {
        const qty = line.quantity != null ? new Decimal(line.quantity) : new Decimal(0);
        const rate = line.rate != null ? new Decimal(line.rate) : new Decimal(0);
        amount = qty.times(rate);
        base = new Decimal(0);
      }
      otherSubtotal = otherSubtotal.plus(amount);
      computedLines.push({ ...line, amount: amount.toDecimalPlaces(2), base });
    }
  }

  const totalRate = directSubtotal
    .plus(overheadSubtotal)
    .plus(profitSubtotal)
    .plus(otherSubtotal)
    .toDecimalPlaces(2);

  return {
    lines: computedLines,
    materialSubtotal: materialSubtotal.toDecimalPlaces(2),
    labourSubtotal: labourSubtotal.toDecimalPlaces(2),
    equipmentSubtotal: equipmentSubtotal.toDecimalPlaces(2),
    directSubtotal: directSubtotal.toDecimalPlaces(2),
    overheadSubtotal: overheadSubtotal.toDecimalPlaces(2),
    profitSubtotal: profitSubtotal.toDecimalPlaces(2),
    otherSubtotal: otherSubtotal.toDecimalPlaces(2),
    totalRate,
  };
}

// ── CRUD ───────────────────────────────────────────────────

/**
 * Create a rate analysis for a BOQ line item.
 * One rate analysis per BOQ item (enforced by @unique on boqItemId).
 */
export async function createRateAnalysis(input: CreateRateAnalysisInput) {
  return prisma.$transaction(async (tx) => {
    const boqItem = await tx.boqItem.findUnique({
      where: { id: input.boqItemId },
    });
    if (!boqItem) throw new ServiceError("BOQ item not found", 404);
    if (boqItem.type !== "LINE_ITEM") {
      throw new ServiceError("Rate analysis can only be created for LINE_ITEM type BOQ items", 400);
    }

    // Check for existing rate analysis
    const existing = await tx.rateAnalysis.findUnique({
      where: { boqItemId: input.boqItemId },
    });
    if (existing) {
      throw new ServiceError("Rate analysis already exists for this BOQ item. Use update instead.", 409);
    }

    if (!input.lines || input.lines.length === 0) {
      throw new ServiceError("At least one rate analysis line is required", 400);
    }

    // Validate lines
    validateLines(input.lines);

    // Compute totals
    const computation = computeRateAnalysis(input.lines, input.wastagePct ?? 0);

    // Create rate analysis + lines
    const rateAnalysis = await tx.rateAnalysis.create({
      data: {
        boqItemId: input.boqItemId,
        perUnit: input.perUnit,
        wastagePct: new Decimal(input.wastagePct ?? 0).toDecimalPlaces(2).toString(),
        notes: input.notes ?? null,
        totalRate: computation.totalRate.toString(),
        materialSubtotal: computation.materialSubtotal.toString(),
        labourSubtotal: computation.labourSubtotal.toString(),
        equipmentSubtotal: computation.equipmentSubtotal.toString(),
        overheadSubtotal: computation.overheadSubtotal.toString(),
        profitSubtotal: computation.profitSubtotal.toString(),
        otherSubtotal: computation.otherSubtotal.toString(),
        lines: {
          create: computation.lines.map((line, i) => ({
            componentType: line.componentType,
            basis: line.basis ?? (line.componentType === "OVERHEAD" || line.componentType === "PROFIT" ? "PERCENTAGE" : "QUANTITY"),
            materialId: line.materialId ?? null,
            description: line.description,
            quantity: line.quantity != null ? new Decimal(line.quantity).toString() : null,
            unit: line.unit ?? null,
            rate: line.rate != null ? new Decimal(line.rate).toString() : null,
            percentage: line.percentage != null ? new Decimal(line.percentage).toString() : null,
            amount: line.amount.toString(),
            sortOrder: line.sortOrder ?? i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    // Optionally update BoqItem.rate
    if (input.updateBoqRate) {
      const qty = boqItem.estimatedQty ? new Decimal(boqItem.estimatedQty) : null;
      const estimatedAmount = qty ? qty.times(computation.totalRate).toDecimalPlaces(2) : null;
      await tx.boqItem.update({
        where: { id: input.boqItemId },
        data: {
          rate: computation.totalRate.toString(),
          estimatedAmount: estimatedAmount?.toString() ?? null,
        },
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RATE_ANALYSIS_CREATE",
        entityType: "RateAnalysis",
        entityId: rateAnalysis.id,
        after: { boqItemId: input.boqItemId, totalRate: computation.totalRate.toString(), lineCount: input.lines.length },
      });
    }

    return rateAnalysis;
  });
}

/**
 * Get the rate analysis for a BOQ line item (with all lines).
 */
export async function getRateAnalysis(boqItemId: string) {
  const ra = await prisma.rateAnalysis.findUnique({
    where: { boqItemId },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
      boqItem: {
        select: { id: true, serialNo: true, description: true, unit: true, rate: true, estimatedQty: true },
      },
    },
  });
  return ra;
}

/**
 * Update a rate analysis (replace all lines + recompute totals).
 */
export async function updateRateAnalysis(
  rateAnalysisId: string,
  input: UpdateRateAnalysisInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rateAnalysis.findUnique({
      where: { id: rateAnalysisId },
      include: { boqItem: true },
    });
    if (!existing) throw new ServiceError("Rate analysis not found", 404);

    // Build update data
    const data: Prisma.RateAnalysisUpdateInput = {};
    if (input.perUnit !== undefined) data.perUnit = input.perUnit;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.wastagePct !== undefined) {
      data.wastagePct = new Decimal(input.wastagePct).toDecimalPlaces(2).toString();
    }

    // If lines are provided, recompute and replace
    let computation: RateAnalysisComputation | null = null;
    if (input.lines !== undefined) {
      if (input.lines.length === 0) {
        throw new ServiceError("At least one rate analysis line is required", 400);
      }
      validateLines(input.lines);
      const wastage = input.wastagePct !== undefined ? input.wastagePct : existing.wastagePct;
      computation = computeRateAnalysis(input.lines, wastage);

      data.totalRate = computation.totalRate.toString();
      data.materialSubtotal = computation.materialSubtotal.toString();
      data.labourSubtotal = computation.labourSubtotal.toString();
      data.equipmentSubtotal = computation.equipmentSubtotal.toString();
      data.overheadSubtotal = computation.overheadSubtotal.toString();
      data.profitSubtotal = computation.profitSubtotal.toString();
      data.otherSubtotal = computation.otherSubtotal.toString();

      // Delete old lines and create new ones
      await tx.rateAnalysisLine.deleteMany({ where: { rateAnalysisId } });
      data.lines = {
        create: computation.lines.map((line, i) => ({
          componentType: line.componentType,
          basis: line.basis ?? (line.componentType === "OVERHEAD" || line.componentType === "PROFIT" ? "PERCENTAGE" : "QUANTITY"),
          materialId: line.materialId ?? null,
          description: line.description,
          quantity: line.quantity != null ? new Decimal(line.quantity).toString() : null,
          unit: line.unit ?? null,
          rate: line.rate != null ? new Decimal(line.rate).toString() : null,
          percentage: line.percentage != null ? new Decimal(line.percentage).toString() : null,
          amount: line.amount.toString(),
          sortOrder: line.sortOrder ?? i,
        })),
      };
    } else if (input.wastagePct !== undefined) {
      // Wastage changed but lines didn't — recompute from existing lines
      const existingLines = await tx.rateAnalysisLine.findMany({
        where: { rateAnalysisId },
        orderBy: { sortOrder: "asc" },
      });
      const lineInputs: RateAnalysisLineInput[] = existingLines.map((l) => ({
        componentType: l.componentType as ComponentType,
        basis: l.basis as LineBasis,
        materialId: l.materialId,
        description: l.description,
        quantity: l.quantity ? new Decimal(l.quantity) : null,
        unit: l.unit,
        rate: l.rate ? new Decimal(l.rate) : null,
        percentage: l.percentage ? new Decimal(l.percentage) : null,
        sortOrder: l.sortOrder,
      }));
      computation = computeRateAnalysis(lineInputs, input.wastagePct);

      data.totalRate = computation.totalRate.toString();
      data.materialSubtotal = computation.materialSubtotal.toString();
      data.labourSubtotal = computation.labourSubtotal.toString();
      data.equipmentSubtotal = computation.equipmentSubtotal.toString();
      data.overheadSubtotal = computation.overheadSubtotal.toString();
      data.profitSubtotal = computation.profitSubtotal.toString();
      data.otherSubtotal = computation.otherSubtotal.toString();

      // Update line amounts (wastage affects material lines)
      for (const computedLine of computation.lines) {
        const existingLine = existingLines.find((l) => l.componentType === computedLine.componentType && l.description === computedLine.description);
        if (existingLine) {
          await tx.rateAnalysisLine.update({
            where: { id: existingLine.id },
            data: { amount: computedLine.amount.toString() },
          });
        }
      }
    }

    const updated = await tx.rateAnalysis.update({
      where: { id: rateAnalysisId },
      data,
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    // Optionally update BoqItem.rate
    if (input.updateBoqRate && computation && existing.boqItem) {
      const qty = existing.boqItem.estimatedQty ? new Decimal(existing.boqItem.estimatedQty) : null;
      const estimatedAmount = qty ? qty.times(computation.totalRate).toDecimalPlaces(2) : null;
      await tx.boqItem.update({
        where: { id: existing.boqItemId },
        data: {
          rate: computation.totalRate.toString(),
          estimatedAmount: estimatedAmount?.toString() ?? null,
        },
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RATE_ANALYSIS_UPDATE",
        entityType: "RateAnalysis",
        entityId: rateAnalysisId,
        after: { totalRate: updated.totalRate.toString() },
      });
    }

    return updated;
  });
}

/**
 * Delete a rate analysis (and all its lines via cascade).
 */
export async function deleteRateAnalysis(rateAnalysisId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rateAnalysis.findUnique({
      where: { id: rateAnalysisId },
    });
    if (!existing) throw new ServiceError("Rate analysis not found", 404);

    await tx.rateAnalysis.delete({ where: { id: rateAnalysisId } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RATE_ANALYSIS_DELETE",
        entityType: "RateAnalysis",
        entityId: rateAnalysisId,
        before: { boqItemId: existing.boqItemId, totalRate: existing.totalRate.toString() },
      });
    }

    return { ok: true };
  });
}

// ── Validation ─────────────────────────────────────────────

function validateLines(lines: RateAnalysisLineInput[]) {
  for (const line of lines) {
    if (!line.description?.trim()) {
      throw new ServiceError("Each rate analysis line requires a description", 400);
    }

    const isPercentageBased =
      line.componentType === "OVERHEAD" || line.componentType === "PROFIT" ||
      (line.componentType === "OTHER" && line.basis === "PERCENTAGE");

    if (isPercentageBased) {
      if (line.percentage == null) {
        throw new ServiceError(`Line "${line.description}" (${line.componentType}) requires a percentage`, 400);
      }
      const pct = new Decimal(line.percentage);
      if (pct.lt(0)) {
        throw new ServiceError(`Line "${line.description}": percentage cannot be negative`, 400);
      }
    } else {
      // QUANTITY basis
      if (line.quantity == null) {
        throw new ServiceError(`Line "${line.description}" (${line.componentType}) requires a quantity`, 400);
      }
      if (line.rate == null) {
        throw new ServiceError(`Line "${line.description}" (${line.componentType}) requires a rate`, 400);
      }
      const qty = new Decimal(line.quantity);
      const rate = new Decimal(line.rate);
      if (qty.lt(0)) {
        throw new ServiceError(`Line "${line.description}": quantity cannot be negative`, 400);
      }
      if (rate.lt(0)) {
        throw new ServiceError(`Line "${line.description}": rate cannot be negative`, 400);
      }
    }
  }
}
