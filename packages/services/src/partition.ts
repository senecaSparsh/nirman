import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Partition Service — land parcel subdivision.
 *
 * The trickiest operation in the system. A parent parcel is split into N children.
 * The parent becomes PARTITIONED (inactive), children become the new sellable units.
 *
 * Invariants enforced:
 * - Parent must be AVAILABLE (not SOLD, HOLD, or already PARTITIONED)
 * - Σ children.area = parent.area (exact, to 3 decimal places)
 *   (includes both saleable and infrastructure children)
 * - Each child.area > 0
 * - At least 2 children
 * - Acquisition cost (+ optional development cost) allocated across SALEABLE
 *   children only — infrastructure plots absorb no cost basis.
 * - Children inherit parent's landPurchaseId, projectId, areaUnit
 * - Nesting allowed: a child (AVAILABLE) can itself be partitioned later
 *
 * Allocation models:
 * - PRO_RATA:      C_i = (C_parent + C_dev) × A_i / Σ(saleable A)
 * - MARKET_VALUE:  C_i = (C_parent + C_dev) × (A_i × W_i) / Σ(A_j × W_j)
 *   where W_i is the weightFactor for each saleable plot (defaults to 1).
 */

export type AllocationModel = "PRO_RATA" | "MARKET_VALUE";

interface PartitionInput {
  parentParcelId: string;
  userId?: string;
  children: {
    number: string;
    area: Decimal | number | string;
    askingPrice?: Decimal | number | string;
    /** Flags non-saleable infrastructure plots (roads, parks, utility corridors).
     *  Infrastructure plots have area but NO cost basis — their cost is absorbed
     *  by the saleable siblings. */
    isInfrastructure?: boolean;
    /** Optional target market value for the plot. */
    marketValue?: Decimal | number | string;
    /** Optional custom weighting index used by the MARKET_VALUE allocation model.
     *  Defaults to 1 when not provided. */
    weightFactor?: Decimal | number | string;
    /** Optional polygon geometry from the CAD canvas — normalized [0,1] vertices. */
    geometry?: unknown;
  }[];
  notes?: string;
  /** Cost allocation model. Defaults to "PRO_RATA". */
  allocationModel?: AllocationModel;
  /** Optional site development costs (grading, paving, utilities) added to the
   *  parent cost basis before allocation across saleable children. */
  developmentCost?: Decimal | number | string;
}

export async function partitionLandParcel(input: PartitionInput) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock + validate parent
    const parent = await tx.landParcel.findUnique({
      where: { id: input.parentParcelId },
    });
    if (!parent) throw new ServiceError("Parent parcel not found", 404);
    if (parent.deletedAt) throw new ServiceError("Parent parcel is deleted");
    if (parent.status !== "AVAILABLE") {
      throw new ServiceError(`Cannot partition parcel in status ${parent.status}. Must be AVAILABLE.`);
    }

    // 2. Validate children
    if (input.children.length < 2) {
      throw new ServiceError("Partition must create at least 2 children");
    }

    const allocationModel: AllocationModel = input.allocationModel ?? "PRO_RATA";
    const childAreas = input.children.map((c) => new Decimal(c.area));
    for (const area of childAreas) {
      if (!area.gt(0)) throw new ServiceError("Each child area must be > 0");
    }

    // 3. Area conservation: Σ children.area = parent.area
    //    (includes both saleable and infrastructure children)
    const sumChildAreas = childAreas.reduce((sum, a) => sum.plus(a), new Decimal(0));
    const parentArea = new Decimal(parent.area);
    if (!sumChildAreas.equals(parentArea)) {
      throw new ServiceError(
        `Area conservation violated: Σ children (${sumChildAreas}) ≠ parent (${parentArea}). ` +
          `Difference: ${sumChildAreas.minus(parentArea)}`,
      );
    }

    // 4. Unique child numbers
    const numbers = input.children.map((c) => c.number);
    if (new Set(numbers).size !== numbers.length) {
      throw new ServiceError("Child parcel numbers must be unique");
    }

    // 5. Partition children into saleable vs infrastructure
    const isInfraFlags = input.children.map((c) => c.isInfrastructure ?? false);
    const saleableIndices = input.children.map((_, i) => i).filter((i) => !isInfraFlags[i]);
    if (saleableIndices.length === 0) {
      throw new ServiceError("At least one saleable (non-infrastructure) child is required");
    }

    // 6. Compute total cost basis = parent acquisition cost + development cost
    const parentCost = new Decimal(parent.acquisitionCost);
    const devCost = input.developmentCost ? new Decimal(input.developmentCost) : new Decimal(0);
    if (devCost.lt(0)) throw new ServiceError("Development cost cannot be negative");
    const totalCostBasis = parentCost.plus(devCost);

    // 7. Allocate cost across saleable children only
    //    PRO_RATA:      C_i = totalCostBasis × A_i / Σ(saleable A)
    //    MARKET_VALUE:  C_i = totalCostBasis × (A_i × W_i) / Σ(A_j × W_j)
    const childCosts = new Array(input.children.length).fill(new Decimal(0));
    if (allocationModel === "MARKET_VALUE") {
      const weightedAreas = saleableIndices.map((i) => {
        const w = input.children[i]!.weightFactor != null
          ? new Decimal(input.children[i]!.weightFactor)
          : new Decimal(1);
        if (!w.gt(0)) throw new ServiceError("Weight factor must be > 0 for saleable plots");
        return childAreas[i]!.times(w);
      });
      const sumWeightedAreas = weightedAreas.reduce((sum, wa) => sum.plus(wa), new Decimal(0));
      if (!sumWeightedAreas.gt(0)) {
        throw new ServiceError("Sum of weighted areas for saleable plots must be > 0");
      }
      saleableIndices.forEach((idx, k) => {
        childCosts[idx] = totalCostBasis.times(weightedAreas[k]!).div(sumWeightedAreas);
      });
    } else {
      // PRO_RATA — distribute across saleable areas only
      const sumSaleableAreas = saleableIndices.reduce(
        (sum, i) => sum.plus(childAreas[i]!),
        new Decimal(0),
      );
      if (!sumSaleableAreas.gt(0)) {
        throw new ServiceError("Sum of saleable areas must be > 0");
      }
      for (const i of saleableIndices) {
        childCosts[i] = totalCostBasis.times(childAreas[i]!).div(sumSaleableAreas);
      }
    }

    // 8. Create children + mark parent PARTITIONED + record partition event
    const childParcels = [];
    const infraAreaTotal = isInfraFlags.reduce(
      (sum, isInfra, i) => (isInfra ? sum.plus(childAreas[i]!) : sum),
      new Decimal(0),
    );
    for (let i = 0; i < input.children.length; i++) {
      const child = input.children[i]!;
      const area = childAreas[i]!;
      const isInfra = isInfraFlags[i]!;
      const childAcquisitionCost = childCosts[i]!; // 0 for infrastructure plots

      const parcel = await tx.landParcel.create({
        data: {
          landPurchaseId: parent.landPurchaseId,
          parentParcelId: parent.id,
          number: child.number,
          area,
          areaUnit: parent.areaUnit,
          status: isInfra ? "HOLD" : "AVAILABLE",
          acquisitionCost: childAcquisitionCost,
          askingPrice: isInfra ? null : (child.askingPrice ? new Decimal(child.askingPrice) : null),
          currentValuation: childAcquisitionCost, // initial valuation = cost (0 for infra)
          projectId: parent.projectId,
          isInfrastructure: isInfra,
          ...(child.marketValue != null ? { marketValue: new Decimal(child.marketValue) } : {}),
          ...(child.weightFactor != null ? { weightFactor: new Decimal(child.weightFactor) } : {}),
          ...(child.geometry ? { geometry: child.geometry as any } : {}),
        },
      });
      childParcels.push(parcel);
    }

    // Mark parent as PARTITIONED (inactive — not sellable as a whole)
    await tx.landParcel.update({
      where: { id: parent.id },
      data: { status: "PARTITIONED" },
    });

    // Record partition event for audit
    await tx.landPartition.create({
      data: {
        parentParcelId: parent.id,
        childCount: input.children.length,
        notes: input.notes,
        allocationModel,
        infrastructureArea: infraAreaTotal.gt(0) ? infraAreaTotal : null,
        developmentCost: devCost.gt(0) ? devCost : null,
      },
    });

    // Re-run cost allocation — parcel structure changed, so per-parcel and
    // per-unit cost allocations must be refreshed.
    if (parent.projectId) {
      await reallocateProjectCosts(tx, parent.projectId);
    }

    await logAction(tx, {
      userId: input.userId,
      action: "LAND_PARTITION",
      entityType: "LandParcel",
      entityId: parent.id,
      before: { status: "AVAILABLE", area: parent.area },
      after: {
        status: "PARTITIONED",
        childCount: input.children.length,
        childIds: childParcels.map((c) => c.id),
        allocationModel,
        developmentCost: devCost.toString(),
        infrastructureArea: infraAreaTotal.toString(),
      },
    });

    return { parent, children: childParcels };
  }, { isolationLevel: "Serializable" });
}

/**
 * Update a parcel's market valuation and/or asking price.
 * Does not change acquisitionCost (historical).
 */
export async function updateParcelValuation(
  parcelId: string,
  data: { currentValuation?: Decimal | number | string; askingPrice?: Decimal | number | string },
  userId?: string,
) {
  const parcel = await prisma.landParcel.findUnique({ where: { id: parcelId } });
  if (!parcel) throw new ServiceError("Parcel not found", 404);
  if (parcel.deletedAt) throw new ServiceError("Parcel is deleted");
  if (parcel.status === "SOLD") throw new ServiceError("Cannot update valuation of a SOLD parcel");
  if (parcel.status === "PARTITIONED") throw new ServiceError("Cannot update valuation of a PARTITIONED parcel");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.landParcel.update({
      where: { id: parcelId },
      data: {
        ...(data.currentValuation !== undefined ? { currentValuation: new Decimal(data.currentValuation) } : {}),
        ...(data.askingPrice !== undefined ? { askingPrice: new Decimal(data.askingPrice) } : {}),
      },
    });
    await logAction(tx, {
      userId,
      action: "LAND_PARCEL_VALUATION",
      entityType: "LandParcel",
      entityId: parcelId,
      before: { currentValuation: parcel.currentValuation, askingPrice: parcel.askingPrice },
      after: { currentValuation: updated.currentValuation, askingPrice: updated.askingPrice },
    });
    return updated;
  });
}

/**
 * Change parcel status between AVAILABLE and HOLD.
 */
export async function setParcelStatus(parcelId: string, status: "AVAILABLE" | "HOLD", userId?: string) {
  const parcel = await prisma.landParcel.findUnique({ where: { id: parcelId } });
  if (!parcel) throw new ServiceError("Parcel not found", 404);
  if (parcel.deletedAt) throw new ServiceError("Parcel is deleted");
  if (parcel.status === "SOLD") throw new ServiceError("Cannot change status of a SOLD parcel");
  if (parcel.status === "PARTITIONED") throw new ServiceError("Cannot change status of a PARTITIONED parcel");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.landParcel.update({ where: { id: parcelId }, data: { status } });
    await logAction(tx, {
      userId,
      action: "LAND_PARCEL_STATUS_CHANGE",
      entityType: "LandParcel",
      entityId: parcelId,
      before: { status: parcel.status },
      after: { status },
    });
    return updated;
  });
}

/**
 * Pure function: validate area conservation without DB access.
 * Used by tests and UI pre-validation.
 *
 * The sum of ALL child areas (saleable + infrastructure) must equal the
 * parent area.
 */
export function validateAreaConservation(
  parentArea: Decimal,
  childAreas: Decimal[],
): { valid: boolean; difference: Decimal } {
  const sum = childAreas.reduce((acc, a) => acc.plus(new Decimal(a)), new Decimal(0));
  const diff = sum.minus(new Decimal(parentArea));
  return { valid: diff.isZero(), difference: diff };
}

/**
 * Pure function: allocate parent cost to children proportionally by area.
 *
 * @deprecated Use `allocatePartitionCosts` which supports infrastructure
 *   absorption and the MARKET_VALUE allocation model. This helper is kept
 *   for backwards compatibility with existing tests.
 */
export function allocateCostByArea(
  parentCost: Decimal,
  parentArea: Decimal,
  childAreas: Decimal[],
): Decimal[] {
  return childAreas.map((area) => {
    const ratio = new Decimal(area).div(new Decimal(parentArea));
    return new Decimal(parentCost).times(ratio);
  });
}

/**
 * Pure function: allocate the total cost basis (parent cost + development
 * cost) across saleable children, with infrastructure cost absorption and
 * optional market-value weighting.
 *
 * - `isInfraFlags[i]` marks infrastructure plots — they receive ZERO cost.
 * - PRO_RATA:      C_i = totalCost × A_i / Σ(saleable A)
 * - MARKET_VALUE:  C_i = totalCost × (A_i × W_i) / Σ(A_j × W_j)
 *   (W_i defaults to 1 when weightFactors[i] is null/undefined)
 *
 * Returns an array of Decimal costs aligned with the input children.
 */
export function allocatePartitionCosts(
  totalCost: Decimal,
  childAreas: Decimal[],
  isInfraFlags: boolean[],
  model: AllocationModel,
  weightFactors?: (Decimal | null | undefined)[],
): Decimal[] {
  const n = childAreas.length;
  const costs = new Array(n).fill(new Decimal(0));
  const saleableIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !isInfraFlags[i]);

  if (saleableIdx.length === 0) return costs;

  if (model === "MARKET_VALUE") {
    const weighted = saleableIdx.map((i) => {
      const w = weightFactors?.[i] != null ? new Decimal(weightFactors[i]!) : new Decimal(1);
      return new Decimal(childAreas[i]!).times(w);
    });
    const sumW = weighted.reduce((s, wa) => s.plus(wa), new Decimal(0));
    saleableIdx.forEach((idx, k) => {
      costs[idx] = new Decimal(totalCost).times(weighted[k]!).div(sumW);
    });
  } else {
    const sumSaleable = saleableIdx.reduce((s, i) => s.plus(new Decimal(childAreas[i]!)), new Decimal(0));
    for (const i of saleableIdx) {
      costs[i] = new Decimal(totalCost).times(new Decimal(childAreas[i]!)).div(sumSaleable);
    }
  }
  return costs;
}
