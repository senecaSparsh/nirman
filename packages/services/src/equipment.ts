import { prisma, type EquipmentStatus, type MaintenanceType } from "@nirman/db";
import Decimal from "decimal.js";

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
}

export async function createEquipment(input: CreateEquipmentInput) {
  const cost = new Decimal(input.acquisitionCost);
  if (!cost.gte(0)) throw new Error("Acquisition cost must be >= 0");

  // Check assetTag uniqueness
  const existing = await prisma.equipment.findUnique({ where: { assetTag: input.assetTag } });
  if (existing) throw new Error(`Equipment with assetTag ${input.assetTag} already exists`);

  return prisma.equipment.create({
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
}

interface AssignEquipmentInput {
  equipmentId: string;
  locationId: string;
  projectId?: string;
  notes?: string;
}

export async function assignEquipment(input: AssignEquipmentInput) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: input.equipmentId } });
    if (!equipment) throw new Error("Equipment not found");
    if (equipment.deletedAt) throw new Error("Equipment is deleted");
    if (equipment.status !== "AVAILABLE") {
      throw new Error(`Cannot assign equipment in status ${equipment.status}. Must be AVAILABLE.`);
    }

    const location = await tx.stockLocation.findFirst({
      where: { id: input.locationId, deletedAt: null },
    });
    if (!location) throw new Error("Location not found or deleted");

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

    return assignment;
  });
}

export async function returnEquipment(assignmentId: string) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.equipmentAssignment.findUnique({
      where: { id: assignmentId },
      include: { equipment: true },
    });
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.status !== "ACTIVE") {
      throw new Error(`Cannot return assignment in status ${assignment.status}`);
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
}

export async function recordMaintenance(input: RecordMaintenanceInput) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: input.equipmentId } });
    if (!equipment) throw new Error("Equipment not found");
    if (equipment.deletedAt) throw new Error("Equipment is deleted");
    if (equipment.status === "RETIRED") throw new Error("Cannot maintain retired equipment");

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

    return maintenance;
  });
}

export async function completeMaintenance(equipmentId: string) {
  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) throw new Error("Equipment not found");
    if (equipment.status !== "IN_MAINTENANCE") {
      throw new Error(`Equipment is not in maintenance (status: ${equipment.status})`);
    }

    // End any open maintenance records
    await tx.equipmentMaintenance.updateMany({
      where: { equipmentId, endDate: null },
      data: { endDate: new Date() },
    });

    return tx.equipment.update({
      where: { id: equipmentId },
      data: { status: "AVAILABLE" },
    });
  });
}

export async function retireEquipment(equipmentId: string) {
  const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!equipment) throw new Error("Equipment not found");
  if (equipment.status === "RETIRED") throw new Error("Equipment already retired");

  return prisma.equipment.update({
    where: { id: equipmentId },
    data: { status: "RETIRED" },
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
