import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";

/**
 * Partition Service — land parcel subdivision.
 *
 * The trickiest operation in the system. A parent parcel is split into N children.
 * The parent becomes PARTITIONED (inactive), children become the new sellable units.
 *
 * Invariants enforced:
 * - Parent must be AVAILABLE (not SOLD, HOLD, or already PARTITIONED)
 * - Σ children.area = parent.area (exact, to 3 decimal places)
 * - Each child.area > 0
 * - At least 2 children
 * - Acquisition cost allocated proportionally by area
 * - Children inherit parent's landPurchaseId, projectId, areaUnit
 * - Nesting allowed: a child (AVAILABLE) can itself be partitioned later
 */

interface PartitionInput {
  parentParcelId: string;
  userId?: string;
  children: {
    number: string;
    area: Decimal | number | string;
    askingPrice?: Decimal | number | string;
    /** Optional polygon geometry from the CAD canvas — normalized [0,1] vertices. */
    geometry?: unknown;
  }[];
  notes?: string;
}

export async function partitionLandParcel(input: PartitionInput) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock + validate parent
    const parent = await tx.landParcel.findUnique({
      where: { id: input.parentParcelId },
    });
    if (!parent) throw new Error("Parent parcel not found");
    if (parent.deletedAt) throw new Error("Parent parcel is deleted");
    if (parent.status !== "AVAILABLE") {
      throw new Error(`Cannot partition parcel in status ${parent.status}. Must be AVAILABLE.`);
    }

    // 2. Validate children
    if (input.children.length < 2) {
      throw new Error("Partition must create at least 2 children");
    }

    const childAreas = input.children.map((c) => new Decimal(c.area));
    for (const area of childAreas) {
      if (!area.gt(0)) throw new Error("Each child area must be > 0");
    }

    // 3. Area conservation: Σ children.area = parent.area
    const sumChildAreas = childAreas.reduce((sum, a) => sum.plus(a), new Decimal(0));
    const parentArea = new Decimal(parent.area);
    if (!sumChildAreas.equals(parentArea)) {
      throw new Error(
        `Area conservation violated: Σ children (${sumChildAreas}) ≠ parent (${parentArea}). ` +
          `Difference: ${sumChildAreas.minus(parentArea)}`,
      );
    }

    // 4. Unique child numbers
    const numbers = input.children.map((c) => c.number);
    if (new Set(numbers).size !== numbers.length) {
      throw new Error("Child parcel numbers must be unique");
    }

    // 5. Allocate acquisition cost proportionally
    const parentCost = new Decimal(parent.acquisitionCost);

    // 6. Create children + mark parent PARTITIONED + record partition event
    const childParcels = [];
    for (let i = 0; i < input.children.length; i++) {
      const child = input.children[i]!;
      const area = childAreas[i]!;
      const costRatio = area.div(parentArea);
      const childAcquisitionCost = parentCost.times(costRatio);

      const parcel = await tx.landParcel.create({
        data: {
          landPurchaseId: parent.landPurchaseId,
          parentParcelId: parent.id,
          number: child.number,
          area,
          areaUnit: parent.areaUnit,
          status: "AVAILABLE",
          acquisitionCost: childAcquisitionCost,
          askingPrice: child.askingPrice ? new Decimal(child.askingPrice) : null,
          currentValuation: childAcquisitionCost, // initial valuation = cost
          projectId: parent.projectId,
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
      after: { status: "PARTITIONED", childCount: input.children.length, childIds: childParcels.map((c) => c.id) },
    });

    return { parent, children: childParcels };
  });
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
  if (!parcel) throw new Error("Parcel not found");
  if (parcel.deletedAt) throw new Error("Parcel is deleted");
  if (parcel.status === "SOLD") throw new Error("Cannot update valuation of a SOLD parcel");
  if (parcel.status === "PARTITIONED") throw new Error("Cannot update valuation of a PARTITIONED parcel");

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
  if (!parcel) throw new Error("Parcel not found");
  if (parcel.deletedAt) throw new Error("Parcel is deleted");
  if (parcel.status === "SOLD") throw new Error("Cannot change status of a SOLD parcel");
  if (parcel.status === "PARTITIONED") throw new Error("Cannot change status of a PARTITIONED parcel");

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
