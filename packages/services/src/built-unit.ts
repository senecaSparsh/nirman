import { prisma, type BuiltUnitType, type BuiltUnitStatus, type AreaUnit } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postWipCapitalization, postJournalEntry, ACCT } from "./gl-posting";

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
    // ── RERA fields (optional, all nullable) ──
    carpetArea?: Decimal | number | string | null;
    superBuiltUpArea?: Decimal | number | string | null;
    balconyArea?: Decimal | number | string | null;
    clearHeight?: Decimal | number | string | null;
    hasLoadingDock?: boolean;
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
          // RERA fields — default superBuiltUpArea to area if not specified
          carpetArea: u.carpetArea != null ? new Decimal(u.carpetArea) : null,
          superBuiltUpArea: u.superBuiltUpArea != null
            ? new Decimal(u.superBuiltUpArea)
            : new Decimal(u.area),
          balconyArea: u.balconyArea != null ? new Decimal(u.balconyArea) : null,
          clearHeight: u.clearHeight != null ? new Decimal(u.clearHeight) : null,
          hasLoadingDock: u.hasLoadingDock ?? false,
          status: "PLANNED",
          originType: "CREATED",
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
  // ── RERA fields ──
  carpetArea?: Decimal | number | string | null;
  superBuiltUpArea?: Decimal | number | string | null;
  balconyArea?: Decimal | number | string | null;
  clearHeight?: Decimal | number | string | null;
  hasLoadingDock?: boolean;
  userId?: string;
}

/**
 * Edit a built unit's core attributes (unitType, unitNumber, floor, wing,
 * area, areaUnit, askingPrice). Only allowed while the unit is PLANNED or
 * UNDER_CONSTRUCTION — once it is AVAILABLE/HOLD/SOLD/RENTED the attributes
 * are locked to preserve the integrity of sales/valuation records.
 */
export async function updateBuiltUnit(unitId: string, data: UpdateBuiltUnitInput) {
  const unit = await prisma.builtUnit.findFirst({ where: { id: unitId, deletedAt: null } });
  if (!unit) throw new ServiceError("Unit not found", 404);
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
        // RERA fields
        ...(data.carpetArea !== undefined
          ? { carpetArea: data.carpetArea == null ? null : new Decimal(data.carpetArea) }
          : {}),
        ...(data.superBuiltUpArea !== undefined
          ? { superBuiltUpArea: data.superBuiltUpArea == null ? null : new Decimal(data.superBuiltUpArea) }
          : {}),
        ...(data.balconyArea !== undefined
          ? { balconyArea: data.balconyArea == null ? null : new Decimal(data.balconyArea) }
          : {}),
        ...(data.clearHeight !== undefined
          ? { clearHeight: data.clearHeight == null ? null : new Decimal(data.clearHeight) }
          : {}),
        ...(data.hasLoadingDock !== undefined ? { hasLoadingDock: data.hasLoadingDock } : {}),
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
        carpetArea: unit.carpetArea?.toString() ?? null,
        superBuiltUpArea: unit.superBuiltUpArea?.toString() ?? null,
        balconyArea: unit.balconyArea?.toString() ?? null,
        clearHeight: unit.clearHeight?.toString() ?? null,
        hasLoadingDock: unit.hasLoadingDock,
      },
      after: {
        unitType: updated.unitType,
        unitNumber: updated.unitNumber,
        floor: updated.floor,
        wing: updated.wing,
        area: updated.area.toString(),
        areaUnit: updated.areaUnit,
        askingPrice: updated.askingPrice?.toString() ?? null,
        carpetArea: updated.carpetArea?.toString() ?? null,
        superBuiltUpArea: updated.superBuiltUpArea?.toString() ?? null,
        balconyArea: updated.balconyArea?.toString() ?? null,
        clearHeight: updated.clearHeight?.toString() ?? null,
        hasLoadingDock: updated.hasLoadingDock,
      },
    });
    return updated;
  });
}

export async function updateUnitStatus(unitId: string, status: BuiltUnitStatus, userId?: string) {
  const unit = await prisma.builtUnit.findUnique({
    where: { id: unitId },
    include: { project: { select: { companyId: true } } },
  });
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

    // WIP Capitalization — when a CREATED unit becomes AVAILABLE, move its
    // accumulated production cost from WIP (1500) to Unsold Assets - Units
    // (1800). PURCHASED units skip this — their cost was posted directly to
    // Unit Asset at purchase time (Dr Unit Asset / Cr Cash), so there's no
    // WIP balance to capitalize.
    if (status === "AVAILABLE" && unit.originType === "CREATED") {
      // Reallocate costs FIRST so productionCost is fresh (handles the case
      // where costs were added after the unit was last reallocated).
      await reallocateProjectCosts(tx, unit.projectId);

      // Re-read the unit to get the fresh productionCost + current capitalizedAmount
      const freshUnit = await tx.builtUnit.findUnique({ where: { id: unitId } });
      if (freshUnit) {
        const productionCost = new Decimal(freshUnit.productionCost ?? 0);
        const alreadyCapitalized = new Decimal(freshUnit.capitalizedAmount ?? 0);
        const delta = productionCost.minus(alreadyCapitalized);

        if (delta.gt(0)) {
          await postWipCapitalization(tx, {
            companyId: unit.project.companyId,
            builtUnitId: unitId,
            projectId: unit.projectId,
            costBasis: delta,
            postedById: userId,
          });
          await tx.builtUnit.update({
            where: { id: unitId },
            data: { capitalizedAmount: productionCost },
          });
        }
      }
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE BUILT UNIT — record buying an existing unit (flat, shop, office)
// Unlike createBuiltUnits (which starts PLANNED and accumulates construction
// cost via WIP), a purchased unit starts AVAILABLE with its acquisition cost
// as the cost basis. No WIP — the cost goes directly to Unit Asset.
// ─────────────────────────────────────────────────────────────────────────────

interface PurchaseBuiltUnitInput {
  companyId: string;
  projectId: string;
  userId?: string;
  unitType: BuiltUnitType;
  unitNumber: string;
  floor?: number;
  wing?: string;
  area: Decimal | number | string;
  areaUnit?: AreaUnit;
  acquisitionCost: Decimal | number | string;
  purchaseDate?: Date;
  askingPrice?: Decimal | number | string;
  landParcelId?: string;
  // RERA fields
  carpetArea?: Decimal | number | string | null;
  superBuiltUpArea?: Decimal | number | string | null;
  balconyArea?: Decimal | number | string | null;
  clearHeight?: Decimal | number | string | null;
  hasLoadingDock?: boolean;
  // Payment
  paymentMode?: string; // "CASH", "BANK", "LOAN" etc.
  notes?: string;
}

export async function purchaseBuiltUnit(input: PurchaseBuiltUnitInput) {
  const acquisitionCost = new Decimal(input.acquisitionCost);
  if (!acquisitionCost.gt(0)) throw new ServiceError("Acquisition cost must be > 0");
  if (!new Decimal(input.area).gt(0)) throw new ServiceError("Unit area must be > 0");

  return prisma.$transaction(async (tx) => {
    // Validate project
    const project = await tx.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    // Check unit number doesn't conflict
    const existing = await tx.builtUnit.findFirst({
      where: { projectId: input.projectId, unitNumber: input.unitNumber, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ServiceError(`Unit number "${input.unitNumber}" already exists in this project`);

    // Validate land parcel if provided
    if (input.landParcelId) {
      const parcel = await tx.landParcel.findFirst({
        where: { id: input.landParcelId, deletedAt: null },
      });
      if (!parcel) throw new ServiceError("Land parcel not found or deleted", 404);
    }

    // Create the unit — PURCHASED units start AVAILABLE (already built, ready to sell)
    const unit = await tx.builtUnit.create({
      data: {
        projectId: input.projectId,
        unitType: input.unitType,
        unitNumber: input.unitNumber,
        floor: input.floor,
        wing: input.wing,
        area: new Decimal(input.area),
        areaUnit: input.areaUnit ?? "SQFT",
        carpetArea: input.carpetArea != null ? new Decimal(input.carpetArea) : null,
        superBuiltUpArea: input.superBuiltUpArea != null ? new Decimal(input.superBuiltUpArea) : new Decimal(input.area),
        balconyArea: input.balconyArea != null ? new Decimal(input.balconyArea) : null,
        clearHeight: input.clearHeight != null ? new Decimal(input.clearHeight) : null,
        hasLoadingDock: input.hasLoadingDock ?? false,
        status: "AVAILABLE",
        originType: "PURCHASED",
        acquisitionCost,
        purchaseDate: input.purchaseDate ?? new Date(),
        landParcelId: input.landParcelId ?? null,
        // For purchased units, productionCost = acquisitionCost (this IS the cost basis)
        productionCost: acquisitionCost,
        // capitalizedAmount = acquisitionCost (already capitalized via direct GL, not WIP)
        capitalizedAmount: acquisitionCost,
        askingPrice: input.askingPrice ? new Decimal(input.askingPrice) : null,
        currentValuation: acquisitionCost, // start at cost; can be updated later
      },
    });

    // GL: Dr Unit Asset (1800) / Cr Cash (1000)
    // This directly capitalizes the unit — no WIP involved.
    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "UNIT_PURCHASE",
      sourceId: unit.id,
      memo: `Unit purchase — ${unit.unitNumber}`,
      postedById: input.userId,
      lines: [
        { accountCode: ACCT.UNIT_ASSET, debit: acquisitionCost, credit: 0, entityType: "BuiltUnit", entityId: unit.id, memo: `Unit asset — ${unit.unitNumber}` },
        { accountCode: ACCT.CASH, debit: 0, credit: acquisitionCost, entityType: "BuiltUnit", entityId: unit.id, memo: `Cash paid for unit purchase` },
      ],
    });

    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "BUILT_UNIT_PURCHASE",
      entityType: "BuiltUnit",
      entityId: unit.id,
      after: {
        unitNumber: unit.unitNumber,
        unitType: unit.unitType,
        originType: "PURCHASED",
        acquisitionCost: acquisitionCost.toString(),
        status: "AVAILABLE",
        projectId: input.projectId,
        landParcelId: input.landParcelId ?? null,
      },
    });

    return unit;
  });
}
