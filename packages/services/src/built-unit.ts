import { prisma, type BuiltUnitType, type BuiltUnitStatus, type AreaUnit } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Built Unit Service — create and manage sellable units within a project.
 */

interface CreateBuiltUnitsInput {
  projectId: string;
  userId?: string;
  units: {
    unitType: BuiltUnitType;
    unitNumber: string;
    floor?: number;
    wing?: string;
    area: Decimal | number | string;
    areaUnit?: AreaUnit;
    askingPrice?: Decimal | number | string;
    phaseId?: string | null;
  }[];
}

export async function createBuiltUnits(input: CreateBuiltUnitsInput) {
  if (input.units.length === 0) throw new ServiceError("Must create at least one unit");

  // Validate units
  for (const u of input.units) {
    if (!new Decimal(u.area).gt(0)) throw new ServiceError(`Unit ${u.unitNumber} area must be > 0`);
  }
  const numbers = input.units.map((u) => u.unitNumber);
  if (new Set(numbers).size !== numbers.length) {
    throw new ServiceError("Unit numbers must be unique within the batch");
  }

  return prisma.$transaction(async (tx) => {
    // Validate project
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    // Check unit numbers don't conflict with existing
    const existing = await tx.builtUnit.findMany({
      where: { projectId: input.projectId, unitNumber: { in: numbers } },
      select: { unitNumber: true },
    });
    if (existing.length > 0) {
      throw new ServiceError(`Unit numbers already exist: ${existing.map((e) => e.unitNumber).join(", ")}`);
    }

    // Create units
    const created = [];
    for (const u of input.units) {
      const unit = await tx.builtUnit.create({
        data: {
          projectId: input.projectId,
          phaseId: u.phaseId ?? null,
          unitType: u.unitType,
          unitNumber: u.unitNumber,
          floor: u.floor,
          wing: u.wing,
          area: new Decimal(u.area),
          areaUnit: u.areaUnit ?? "SQFT",
          status: "PLANNED",
          productionCost: new Decimal(0), // will be allocated by reallocateProjectCosts
          askingPrice: u.askingPrice ? new Decimal(u.askingPrice) : null,
          currentValuation: new Decimal(0),
        },
      });
      created.push(unit);
    }

    // Trigger reallocation — new units change totalSellableArea → costPerSqft changes for all
    await reallocateProjectCosts(tx, input.projectId);

    for (const unit of created) {
      await logAction(tx, {
        userId: input.userId,
        action: "BUILT_UNIT_CREATE",
        entityType: "BuiltUnit",
        entityId: unit.id,
        after: { projectId: input.projectId, unitNumber: unit.unitNumber, unitType: unit.unitType, status: "PLANNED" },
      });
    }

    return created;
  });
}

interface UpdateBuiltUnitInput {
  unitType?: BuiltUnitType;
  unitNumber?: string;
  floor?: number | null;
  wing?: string | null;
  area?: Decimal | number | string;
  areaUnit?: AreaUnit;
  askingPrice?: Decimal | number | string | null;
  userId?: string;
}

/**
 * Edit a built unit's core attributes (unitType, unitNumber, floor, wing,
 * area, areaUnit, askingPrice). Only allowed while the unit is PLANNED or
 * UNDER_CONSTRUCTION — once it is AVAILABLE/HOLD/SOLD/RENTED the attributes
 * are locked to preserve the integrity of sales/valuation records.
 */
export async function updateBuiltUnit(unitId: string, data: UpdateBuiltUnitInput) {
  const unit = await prisma.builtUnit.findUnique({ where: { id: unitId } });
  if (!unit) throw new ServiceError("Unit not found", 404);
  if (unit.deletedAt) throw new ServiceError("Unit is deleted");
  if (unit.status !== "PLANNED" && unit.status !== "UNDER_CONSTRUCTION") {
    throw new ServiceError(`Cannot edit a ${unit.status} unit — only PLANNED or UNDER_CONSTRUCTION units can be edited`);
  }

  // If unit number is changing, ensure it doesn't collide with another unit
  // in the same project.
  if (data.unitNumber != null && data.unitNumber !== unit.unitNumber) {
    const conflict = await prisma.builtUnit.findFirst({
      where: {
        projectId: unit.projectId,
        unitNumber: data.unitNumber,
        id: { not: unitId },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (conflict) throw new ServiceError(`Unit number "${data.unitNumber}" already exists in this project`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.builtUnit.update({
      where: { id: unitId },
      data: {
        ...(data.unitType != null ? { unitType: data.unitType } : {}),
        ...(data.unitNumber != null ? { unitNumber: data.unitNumber } : {}),
        ...(data.floor !== undefined ? { floor: data.floor } : {}),
        ...(data.wing !== undefined ? { wing: data.wing } : {}),
        ...(data.area != null ? { area: new Decimal(data.area) } : {}),
        ...(data.areaUnit != null ? { areaUnit: data.areaUnit } : {}),
        ...(data.askingPrice !== undefined
          ? { askingPrice: data.askingPrice == null ? null : new Decimal(data.askingPrice) }
          : {}),
      },
    });

    // Area changes affect cost-per-sqft allocation for the whole project.
    if (data.area != null) {
      await reallocateProjectCosts(tx, unit.projectId);
    }

    await logAction(tx, {
      userId: data.userId,
      action: "BUILT_UNIT_EDIT",
      entityType: "BuiltUnit",
      entityId: unitId,
      before: {
        unitType: unit.unitType,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        wing: unit.wing,
        area: unit.area.toString(),
        areaUnit: unit.areaUnit,
        askingPrice: unit.askingPrice?.toString() ?? null,
      },
      after: {
        unitType: updated.unitType,
        unitNumber: updated.unitNumber,
        floor: updated.floor,
        wing: updated.wing,
        area: updated.area.toString(),
        areaUnit: updated.areaUnit,
        askingPrice: updated.askingPrice?.toString() ?? null,
      },
    });
    return updated;
  });
}

export async function updateUnitStatus(unitId: string, status: BuiltUnitStatus, userId?: string) {
  const unit = await prisma.builtUnit.findUnique({ where: { id: unitId } });
  if (!unit) throw new ServiceError("Unit not found", 404);
  if (unit.deletedAt) throw new ServiceError("Unit is deleted");
  if (unit.status === "SOLD") throw new ServiceError("Cannot change status of a SOLD unit");

  // Validate transitions
  const validTransitions: Record<string, BuiltUnitStatus[]> = {
    PLANNED: ["UNDER_CONSTRUCTION"],
    UNDER_CONSTRUCTION: ["AVAILABLE", "PLANNED"],
    AVAILABLE: ["HOLD", "UNDER_CONSTRUCTION"],
    HOLD: ["AVAILABLE"],
  };
  const allowed = validTransitions[unit.status] ?? [];
  if (!allowed.includes(status)) {
    throw new ServiceError(`Invalid status transition: ${unit.status} → ${status}. Allowed: ${allowed.join(", ")}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.builtUnit.update({ where: { id: unitId }, data: { status } });
    await logAction(tx, {
      userId,
      action: "BUILT_UNIT_STATUS_CHANGE",
      entityType: "BuiltUnit",
      entityId: unitId,
      before: { status: unit.status },
      after: { status },
    });
    return updated;
  });
}

export async function updateUnitValuation(
  unitId: string,
  data: { currentValuation?: Decimal | number | string; askingPrice?: Decimal | number | string },
  userId?: string,
) {
  const unit = await prisma.builtUnit.findUnique({ where: { id: unitId } });
  if (!unit) throw new ServiceError("Unit not found", 404);
  if (unit.deletedAt) throw new ServiceError("Unit is deleted");
  if (unit.status === "SOLD") throw new ServiceError("Cannot update valuation of a SOLD unit");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.builtUnit.update({
      where: { id: unitId },
      data: {
        ...(data.currentValuation !== undefined ? { currentValuation: new Decimal(data.currentValuation) } : {}),
        ...(data.askingPrice !== undefined ? { askingPrice: new Decimal(data.askingPrice) } : {}),
      },
    });
    await logAction(tx, {
      userId,
      action: "BUILT_UNIT_VALUATION",
      entityType: "BuiltUnit",
      entityId: unitId,
      before: { currentValuation: unit.currentValuation, askingPrice: unit.askingPrice },
      after: { currentValuation: updated.currentValuation, askingPrice: updated.askingPrice },
    });
    return updated;
  });
}
