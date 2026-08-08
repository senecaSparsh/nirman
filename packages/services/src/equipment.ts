import { prisma, type EquipmentStatus, type MaintenanceType } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postEquipmentAcquisition, postEquipmentMaintenance, postEquipmentRetirement } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Equipment Service — manage discrete, trackable assets (machinery, tools, vehicles).
 *
 * Unlike fungible materials, equipment is unique. It gets ASSIGNED to a location/project
 * (not issued/consumed), and RETURNED when done. It has maintenance logs and depreciates.
 *
 * State machine:
 *   AVAILABLE → ASSIGNED (assign to site) → AVAILABLE (return)
 *   AVAILABLE/ASSIGNED → IN_MAINTENANCE → AVAILABLE (maintenance done)
 *   any → RETIRED (terminal)
 *   RETIRED → AVAILABLE (un-retire, restores to serviceable pool)
 */

interface CreateEquipmentInput {
  assetTag: string;
  name: string;
  model?: string;
  serialNumber?: string;
  category?: string;
  companyId: string;
  acquisitionCost: Decimal | number | string;
  purchaseDate?: Date;
  notes?: string;
  userId?: string;
}

export async function createEquipment(input: CreateEquipmentInput) {
  const cost = new Decimal(input.acquisitionCost);
  if (!cost.gte(0)) throw new ServiceError("Acquisition cost must be >= 0");

  // Check assetTag uniqueness
  const existing = await prisma.equipment.findUnique({ where: { assetTag: input.assetTag } });
  if (existing) throw new ServiceError(`Equipment with assetTag ${input.assetTag} already exists`);

  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.create({
      data: {
        assetTag: input.assetTag,
        name: input.name,
        model: input.model,
        serialNumber: input.serialNumber,
        category: input.category,
        companyId: input.companyId,
        acquisitionCost: cost,
        currentValue: cost, // initial value = acquisition cost (depreciation applied later)
        purchaseDate: input.purchaseDate,
        notes: input.notes,
        status: "AVAILABLE",
      },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "EQUIPMENT_CREATE",
      entityType: "Equipment",
      entityId: equipment.id,
      after: { assetTag: equipment.assetTag, name: equipment.name, acquisitionCost: cost, status: "AVAILABLE" },
    });

    // Post to GL: capitalise the equipment as a fixed asset, credit cash.
    await postEquipmentAcquisition(tx, {
      companyId: input.companyId,
      equipmentId: equipment.id,
      acquisitionCost: cost,
      postedById: input.userId,
    });

    return equipment;
  });
}

interface AssignEquipmentInput {
  equipmentId: string;
  locationId: string;
  projectId?: string;
  notes?: string;
  userId?: string;
}

export async function assignEquipment(input: AssignEquipmentInput) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: input.equipmentId } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.deletedAt) throw new ServiceError("Equipment is deleted");
    if (equipment.status !== "AVAILABLE") {
      throw new ServiceError(`Cannot assign equipment in status ${equipment.status}. Must be AVAILABLE.`);
    }

    const location = await tx.stockLocation.findFirst({
      where: { id: input.locationId, deletedAt: null },
    });
    if (!location) throw new ServiceError("Location not found or deleted", 404);

    // Create assignment
    const assignment = await tx.equipmentAssignment.create({
      data: {
        equipmentId: input.equipmentId,
        locationId: input.locationId,
        projectId: input.projectId,
        notes: input.notes,
        status: "ACTIVE",
      },
    });

    // Update equipment status
    await tx.equipment.update({
      where: { id: input.equipmentId },
      data: { status: "ASSIGNED" },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "EQUIPMENT_ASSIGN",
      entityType: "EquipmentAssignment",
      entityId: assignment.id,
      after: { equipmentId: input.equipmentId, locationId: input.locationId, projectId: input.projectId ?? null, status: "ACTIVE" },
    });
    return assignment;
  });
}

export async function returnEquipment(assignmentId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.equipmentAssignment.findUnique({
      where: { id: assignmentId },
      include: { equipment: true },
    });
    if (!assignment) throw new ServiceError("Assignment not found", 404);
    if (assignment.status !== "ACTIVE") {
      throw new ServiceError(`Cannot return assignment in status ${assignment.status}`);
    }

    await tx.equipmentAssignment.update({
      where: { id: assignmentId },
      data: { status: "RETURNED", returnedAt: new Date() },
    });

    // Check if there's an open maintenance record — if so, equipment goes
    // back to IN_MAINTENANCE instead of AVAILABLE.
    const openMaintenance = await tx.equipmentMaintenance.findFirst({
      where: { equipmentId: assignment.equipmentId, endDate: null },
    });
    const newStatus: EquipmentStatus = openMaintenance ? "IN_MAINTENANCE" : "AVAILABLE";

    await tx.equipment.update({
      where: { id: assignment.equipmentId },
      data: { status: newStatus },
    });

    await logAction(tx, {
      userId,
      action: "EQUIPMENT_RETURN",
      entityType: "EquipmentAssignment",
      entityId: assignmentId,
      before: { status: "ACTIVE" },
      after: { status: "RETURNED", equipmentStatus: newStatus },
    });
    return { returned: true };
  });
}

interface RecordMaintenanceInput {
  equipmentId: string;
  type: MaintenanceType;
  cost?: Decimal | number | string;
  vendor?: string;
  notes?: string;
  endDate?: Date;
  userId?: string;
}

export async function recordMaintenance(input: RecordMaintenanceInput) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: input.equipmentId } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.deletedAt) throw new ServiceError("Equipment is deleted");
    if (equipment.status === "RETIRED") throw new ServiceError("Cannot maintain retired equipment");

    const maintenance = await tx.equipmentMaintenance.create({
      data: {
        equipmentId: input.equipmentId,
        type: input.type,
        cost: new Decimal(input.cost ?? 0),
        vendor: input.vendor,
        notes: input.notes,
        endDate: input.endDate,
      },
    });

    // Set equipment to IN_MAINTENANCE if no end date (ongoing)
    if (!input.endDate) {
      await tx.equipment.update({
        where: { id: input.equipmentId },
        data: { status: "IN_MAINTENANCE" },
      });
    }

    await logAction(tx, {
      userId: input.userId,
      action: "EQUIPMENT_MAINTENANCE_RECORD",
      entityType: "EquipmentMaintenance",
      entityId: maintenance.id,
      after: { equipmentId: input.equipmentId, type: input.type, cost: input.cost ?? 0 },
    });

    // Post to GL: expense the maintenance cost, credit cash.
    await postEquipmentMaintenance(tx, {
      companyId: equipment.companyId,
      equipmentId: input.equipmentId,
      maintenanceId: maintenance.id,
      cost: input.cost ?? 0,
      postedById: input.userId,
    });

    return maintenance;
  });
}

export async function completeMaintenance(equipmentId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status !== "IN_MAINTENANCE") {
      throw new ServiceError(`Equipment is not in maintenance (status: ${equipment.status})`);
    }

    // End any open maintenance records
    await tx.equipmentMaintenance.updateMany({
      where: { equipmentId, endDate: null },
      data: { endDate: new Date() },
    });

    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: { status: "AVAILABLE" },
    });

    await logAction(tx, {
      userId,
      action: "EQUIPMENT_MAINTENANCE_COMPLETE",
      entityType: "Equipment",
      entityId: equipmentId,
      before: { status: "IN_MAINTENANCE" },
      after: { status: "AVAILABLE" },
    });
    return updated;
  });
}

export async function retireEquipment(equipmentId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status === "RETIRED") throw new ServiceError("Equipment already retired");

    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: { status: "RETIRED" },
    });

    // Post to GL: relieve the fixed asset at its current (depreciated) value.
    await postEquipmentRetirement(tx, {
      companyId: equipment.companyId,
      equipmentId,
      currentValue: equipment.currentValue,
      postedById: userId,
    });

    await logAction(tx, {
      userId,
      action: "EQUIPMENT_RETIRE",
      entityType: "Equipment",
      entityId: equipmentId,
      before: { status: equipment.status },
      after: { status: "RETIRED" },
    });
    return updated;
  });
}

/**
 * Un-retire equipment: restore a retired asset to the AVAILABLE pool.
 * Refuses if there is an open (non-returned) assignment or incomplete maintenance,
 * since those would conflict with the AVAILABLE status.
 */
export async function unretireEquipment(equipmentId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status !== "RETIRED") throw new ServiceError("Only retired equipment can be un-retired");

    const openAssignment = await tx.equipmentAssignment.findFirst({
      where: { equipmentId, status: "ACTIVE" },
    });
    if (openAssignment) throw new ServiceError("Cannot un-retire equipment with an active assignment");

    const openMaintenance = await tx.equipmentMaintenance.findFirst({
      where: { equipmentId, endDate: null },
    });
    if (openMaintenance) throw new ServiceError("Cannot un-retire equipment with open maintenance");

    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: { status: "AVAILABLE" },
    });

    await logAction(tx, {
      userId,
      action: "EQUIPMENT_UNRETIRE",
      entityType: "Equipment",
      entityId: equipmentId,
      before: { status: "RETIRED" },
      after: { status: "AVAILABLE" },
    });
    return updated;
  });
}

/**
 * Apply straight-line depreciation: currentValue = acquisitionCost × (1 - annualRate × yearsElapsed)
 * Pure function for testing.
 */
export function computeDepreciatedValue(
  acquisitionCost: Decimal,
  annualRate: Decimal, // e.g. 0.15 for 15% per year
  yearsElapsed: Decimal,
): Decimal {
  const depreciation = new Decimal(acquisitionCost).times(new Decimal(annualRate)).times(new Decimal(yearsElapsed));
  const depreciated = new Decimal(acquisitionCost).minus(depreciation);
  // Don't go below zero
  return depreciated.lt(0) ? new Decimal(0) : depreciated;
}
