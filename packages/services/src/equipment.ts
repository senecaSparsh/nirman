import { prisma, type EquipmentStatus, type MaintenanceType } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postEquipmentAcquisition, postEquipmentMaintenance, postEquipmentRetirement, postEquipmentSale } from "./gl-posting";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

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

  return withSerializableTransaction(async (tx) => {
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
  const result = await withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: input.equipmentId, deletedAt: null } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
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
    return { assignment, companyId: equipment.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.EQUIPMENT_ASSIGNED,
    companyId: result.companyId,
    entityType: "EquipmentAssignment",
    entityId: result.assignment.id,
    variables: { equipmentId: input.equipmentId, locationId: input.locationId },
    timestamp: new Date(),
  });
  return result.assignment;
}

export async function returnEquipment(assignmentId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
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
  return withSerializableTransaction(async (tx) => {
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

export async function completeMaintenance(
  equipmentId: string,
  userId?: string,
  finalCost?: Decimal | number | string,
) {
  return withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: equipmentId, deletedAt: null } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status !== "IN_MAINTENANCE") {
      throw new ServiceError(`Equipment is not in maintenance (status: ${equipment.status})`);
    }

    // End any open maintenance records
    const openMaintenances = await tx.equipmentMaintenance.findMany({
      where: { equipmentId, endDate: null },
    });
    if (openMaintenances.length === 0) {
      throw new ServiceError("No open maintenance records found for this equipment");
    }

    // If a final cost is provided, update the maintenance records and post GL
    let glPosted = false;
    if (finalCost !== undefined) {
      const costDecimal = new Decimal(finalCost);
      if (costDecimal.lt(0)) throw new ServiceError("Maintenance cost cannot be negative");

      for (const m of openMaintenances) {
        const previousCost = new Decimal(m.cost);
        const costDelta = costDecimal.minus(previousCost);
        await tx.equipmentMaintenance.update({
          where: { id: m.id },
          data: { cost: costDecimal },
        });
        // Post GL only for the delta (the original cost was posted at record time)
        if (!costDelta.equals(0)) {
          await postEquipmentMaintenance(tx, {
            companyId: equipment.companyId,
            equipmentId,
            maintenanceId: m.id,
            cost: costDelta,
            postedById: userId,
          });
          glPosted = true;
        }
      }
    }

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
      after: { status: "AVAILABLE", finalCost: finalCost?.toString() ?? null, glPosted },
    });
    return updated;
  });
}

export async function retireEquipment(equipmentId: string, userId?: string) {
  const result = await withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: equipmentId, deletedAt: null } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status === "RETIRED") throw new ServiceError("Equipment already retired");
    if (equipment.status === "ASSIGNED") {
      // Auto-return any active assignment before retiring
      const activeAssignment = await tx.equipmentAssignment.findFirst({
        where: { equipmentId, status: "ACTIVE" },
      });
      if (activeAssignment) {
        await tx.equipmentAssignment.update({
          where: { id: activeAssignment.id },
          data: { status: "RETURNED", returnedAt: new Date() },
        });
      }
    }

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
    return { updated, companyId: equipment.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.EQUIPMENT_RETIRED,
    companyId: result.companyId,
    entityType: "Equipment",
    entityId: equipmentId,
    variables: { equipmentId, name: result.updated.name },
    timestamp: new Date(),
  });
  return result.updated;
}

/**
 * Un-retire equipment: restore a retired asset to the AVAILABLE pool.
 * Refuses if there is an open (non-returned) assignment or incomplete maintenance,
 * since those would conflict with the AVAILABLE status.
 */
export async function unretireEquipment(equipmentId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: equipmentId, deletedAt: null } });
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
 * Sell equipment to a third party. Sets status to SOLD (terminal),
 * posts GL entries (revenue + COGS + gain/loss on disposal), and
 * logs the action. Refuses if equipment is ASSIGNED or IN_MAINTENANCE.
 */
export async function sellEquipment(
  equipmentId: string,
  input: {
    salePrice: Decimal | number | string;
    gstAmount?: Decimal | number | string;
    buyerName?: string;
    buyerPhone?: string;
    saleDate?: Date;
    notes?: string;
  },
  userId?: string,
) {
  const result = await withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: equipmentId, deletedAt: null } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    if (equipment.status === "SOLD") throw new ServiceError("Equipment already sold");
    if (equipment.status === "ASSIGNED") throw new ServiceError("Return the equipment before selling it");
    if (equipment.status === "IN_MAINTENANCE") throw new ServiceError("Equipment in maintenance — complete or cancel maintenance before selling");

    const salePrice = new Decimal(input.salePrice);
    if (salePrice.lte(0)) throw new ServiceError("Sale price must be positive");

    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: {
        status: "SOLD",
        notes: input.notes ? `${equipment.notes ?? ""}\n[Sale] ${input.notes}`.trim() : equipment.notes,
      },
    });

    // Post GL: revenue + relieve asset at currentValue + gain/loss
    await postEquipmentSale(tx, {
      companyId: equipment.companyId,
      equipmentId,
      salePrice,
      currentValue: equipment.currentValue,
      gstAmount: input.gstAmount ?? 0,
      postedById: userId,
    });

    await logAction(tx, {
      userId,
      action: "EQUIPMENT_SELL",
      entityType: "Equipment",
      entityId: equipmentId,
      before: { status: equipment.status, currentValue: equipment.currentValue.toString() },
      after: { status: "SOLD", salePrice: salePrice.toString(), buyerName: input.buyerName ?? null },
    });
    return { updated, companyId: equipment.companyId, salePrice };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.EQUIPMENT_SOLD,
    companyId: result.companyId,
    entityType: "Equipment",
    entityId: equipmentId,
    variables: { equipmentId, salePrice: result.salePrice.toFixed(2), buyerName: input.buyerName ?? "" },
    timestamp: new Date(),
  });
  return result.updated;
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
