import { prisma, type EquipmentStatus, type MaintenanceType } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postEquipmentAcquisition, postEquipmentMaintenance, postEquipmentRetirement, postEquipmentSale, postDepreciation, ACCT } from "./gl-posting";
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
  /** Straight-line fraction per year (0.15 = 15%). Null/undefined → no depreciation. */
  annualDepreciationRate?: Decimal | number | string | null;
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
        annualDepreciationRate: input.annualDepreciationRate != null ? new Decimal(input.annualDepreciationRate) : null,
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
  /** The caller's active company — equipment, location, and project must
   *  all belong to it. */
  companyId?: string;
}

export async function assignEquipment(input: AssignEquipmentInput) {
  const result = await withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({ where: { id: input.equipmentId, deletedAt: null } });
    if (!equipment) throw new ServiceError("Equipment not found", 404);
    // Tenant seal: the equipment, the destination location, and the project
    // must all live in the caller's company — previously a foreign
    // locationId/projectId could be pinned onto the assignment, leaking the
    // other tenant's location/project names and polluting their site view.
    if (input.companyId && equipment.companyId !== input.companyId) {
      throw new ServiceError("Equipment not found", 404);
    }
    if (equipment.status !== "AVAILABLE") {
      throw new ServiceError(`Cannot assign equipment in status ${equipment.status}. Must be AVAILABLE.`);
    }

    const location = await tx.stockLocation.findFirst({
      where: {
        id: input.locationId,
        deletedAt: null,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
    });
    if (!location) throw new ServiceError("Location not found or deleted", 404);

    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: {
          id: input.projectId,
          deletedAt: null,
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });
      if (!project) throw new ServiceError("Project not found", 404);
    }

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
    return { assignment, companyId: equipment.companyId, equipmentName: equipment.name };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.EQUIPMENT_ASSIGNED,
    companyId: result.companyId,
    entityType: "EquipmentAssignment",
    entityId: result.assignment.id,
    variables: { equipmentId: input.equipmentId, equipmentName: result.equipmentName, locationId: input.locationId },
    excludeIds: [input.userId],
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
    excludeIds: [userId],
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
    variables: { equipmentId, equipmentName: result.updated.name, salePrice: result.salePrice.toFixed(2), buyerName: input.buyerName ?? "" },
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

// ─────────────────────────────────────────────────────────────────────────
//  EQUIPMENT USAGE LOG — daily fuel + run-hours per machine.
//
//  Diesel is the biggest controllable site leakage: a JCB or generator that
//  logs 8 run-hours but drank 40L when the machine spec is ~4L/hr is theft
//  or a broken machine. The log captures fuel filled + opening/closing meter
//  so litres-per-hour and cost-per-hour are derivable, and so preventive
//  maintenance can schedule off actual run-hours instead of calendar guesses.
//
//  Operational telemetry only — the fuel *purchase* is already an expense /
//  procurement flow, so no GL posting here (that would double-count).
// ─────────────────────────────────────────────────────────────────────────

export interface LogEquipmentUsageInput {
  equipmentId: string;
  companyId: string;
  projectId?: string | null;
  logDate?: Date | string;
  meterKind?: "HOURS" | "KM";
  openingMeter?: Decimal | number | string | null;
  closingMeter?: Decimal | number | string | null;
  fuelLitres?: Decimal | number | string | null;
  fuelCost?: Decimal | number | string | null;
  operatorName?: string;
  notes?: string;
  userId?: string;
}

export async function logEquipmentUsage(input: LogEquipmentUsageInput) {
  return withSerializableTransaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({
      where: { id: input.equipmentId, companyId: input.companyId, deletedAt: null },
    });
    if (!equipment) throw new ServiceError("Equipment not found or deleted", 404);
    if (equipment.status === "RETIRED") throw new ServiceError("Cannot log usage on retired equipment");

    // Validate the meter pair — closing must be ≥ opening when both present,
    // and a closing without an opening is meaningless for run-hours.
    const opening = input.openingMeter != null ? new Decimal(input.openingMeter) : null;
    const closing = input.closingMeter != null ? new Decimal(input.closingMeter) : null;
    if (closing != null && opening == null) {
      throw new ServiceError("Closing meter requires an opening reading", 400);
    }
    if (opening != null && closing != null && closing.lt(opening)) {
      throw new ServiceError("Closing meter cannot be below opening meter", 400);
    }

    const fuelLitres = input.fuelLitres != null ? new Decimal(input.fuelLitres) : null;
    const fuelCost = input.fuelCost != null ? new Decimal(input.fuelCost) : null;
    if (fuelLitres != null && fuelLitres.lte(0)) throw new ServiceError("fuelLitres must be > 0", 400);
    if (fuelCost != null && fuelCost.lt(0)) throw new ServiceError("fuelCost cannot be negative", 400);

    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!project) throw new ServiceError("Project not found or does not belong to this company", 404);
    }

    const log = await tx.equipmentUsageLog.create({
      data: {
        equipmentId: input.equipmentId,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        logDate: input.logDate ? new Date(input.logDate) : new Date(),
        meterKind: input.meterKind ?? "HOURS",
        openingMeter: opening,
        closingMeter: closing,
        fuelLitres,
        fuelCost,
        operatorName: input.operatorName,
        notes: input.notes,
        loggedById: input.userId,
      },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "EQUIPMENT_USAGE_LOG",
      entityType: "EquipmentUsageLog",
      entityId: log.id,
      after: {
        equipmentId: input.equipmentId,
        fuelLitres: fuelLitres?.toString() ?? null,
        run: opening != null && closing != null ? closing.minus(opening).toString() : null,
      },
    });

    return log;
  });
}

export interface EquipmentUsageSummary {
  totalFuelLitres: Decimal;
  totalFuelCost: Decimal;
  totalRun: Decimal; // sum of (closing − opening) across logs
  runUnit: string;   // "hrs" | "km"
  litresPerUnit: Decimal | null;  // fuel / run — the leakage signal
  costPerUnit: Decimal | null;    // fuelCost / run
}

export async function getEquipmentUsageSummary(equipmentId: string): Promise<EquipmentUsageSummary> {
  const logs = await prisma.equipmentUsageLog.findMany({
    where: { equipmentId },
    orderBy: { logDate: "asc" },
  });
  let totalFuel = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalRun = new Decimal(0);
  let runUnit = "hrs";
  for (const l of logs) {
    if (l.fuelLitres) totalFuel = totalFuel.plus(l.fuelLitres);
    if (l.fuelCost) totalCost = totalCost.plus(l.fuelCost);
    if (l.openingMeter != null && l.closingMeter != null) {
      totalRun = totalRun.plus(new Decimal(l.closingMeter).minus(l.openingMeter));
    }
    if (l.meterKind === "KM") runUnit = "km";
  }
  return {
    totalFuelLitres: totalFuel,
    totalFuelCost: totalCost,
    totalRun,
    runUnit,
    litresPerUnit: totalRun.gt(0) ? totalFuel.div(totalRun) : null,
    costPerUnit: totalRun.gt(0) ? totalCost.div(totalRun) : null,
  };
}

export async function listEquipmentUsage(
  companyId: string,
  equipmentId?: string,
  scopeFilter?: Record<string, unknown>,
) {
  return prisma.equipmentUsageLog.findMany({
    where: { companyId, ...(equipmentId ? { equipmentId } : {}), ...(scopeFilter ?? {}) },
    orderBy: { logDate: "desc" },
    take: 200,
    include: {
      equipment: { select: { id: true, name: true, assetTag: true } },
      project: { select: { id: true, name: true } },
      loggedBy: { select: { name: true } },
    },
  });
}

export interface ServiceStatus {
  dueNow: boolean;        // interval reached/exceeded
  hoursToService: number | null;  // negative when overdue
  latestMeter: number | null;
  intervalHours: number | null;
}

/**
 * Preventive maintenance off ACTUAL run-hours — the latest usage-log meter
 * minus the meter at last service, vs the machine's service interval.
 * Returns null interval when the machine has no service schedule configured.
 */
export function computeServiceStatus(
  latestMeter: number | null,
  lastServiceMeter: number | null,
  serviceIntervalHours: number | null,
): ServiceStatus | null {
  if (serviceIntervalHours == null || serviceIntervalHours <= 0) return null;
  if (latestMeter == null) return { dueNow: false, hoursToService: serviceIntervalHours, latestMeter: null, intervalHours: serviceIntervalHours };
  const sinceService = lastServiceMeter != null ? latestMeter - lastServiceMeter : latestMeter;
  const hoursToService = serviceIntervalHours - sinceService;
  return {
    dueNow: hoursToService <= 0,
    hoursToService,
    latestMeter,
    intervalHours: serviceIntervalHours,
  };
}

/** Latest recorded meter reading for a machine (for service-due checks). */
export async function getLatestMeter(equipmentId: string): Promise<number | null> {
  const log = await prisma.equipmentUsageLog.findFirst({
    where: { equipmentId, closingMeter: { not: null } },
    orderBy: { logDate: "desc" },
    select: { closingMeter: true },
  });
  return log?.closingMeter != null ? Number(log.closingMeter) : null;
}

// ───────────────────────────────────────────────────────────
//  checkEquipmentMaintenanceDue — cron sweep: machines whose
//  run-hours since last service crossed their serviceInterval
//  (computeServiceStatus). Emits EQUIPMENT_MAINTENANCE_DUE,
//  deduped per equipment per 7 days — fires once per due
//  window, not every cron tick.
// ───────────────────────────────────────────────────────────

export async function checkEquipmentMaintenanceDue(): Promise<{
  checked: number;
  due: number;
  notified: number;
}> {
  const { emitNotificationEvent, NotificationEventType } = await import("./notification-event-bus");

  const now = new Date();
  const dedupeSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const equipment = await prisma.equipment.findMany({
    where: {
      serviceIntervalHours: { not: null, gt: 0 },
      deletedAt: null,
      status: { notIn: ["RETIRED", "SOLD"] },
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      serviceIntervalHours: true,
      lastServiceMeter: true,
    },
  });

  let due = 0;
  let notified = 0;
  for (const eq of equipment) {
    const latestMeter = await getLatestMeter(eq.id);
    const status = computeServiceStatus(
      latestMeter,
      eq.lastServiceMeter != null ? Number(eq.lastServiceMeter) : null,
      eq.serviceIntervalHours != null ? Number(eq.serviceIntervalHours) : null,
    );
    if (!status?.dueNow) continue;
    due++;

    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: eq.companyId,
        eventType: NotificationEventType.EQUIPMENT_MAINTENANCE_DUE,
        createdAt: { gte: dedupeSince },
        metadata: { path: ["equipmentId"], equals: eq.id },
      },
      select: { id: true },
    });
    if (recent) continue;

    void emitNotificationEvent({
      eventType: NotificationEventType.EQUIPMENT_MAINTENANCE_DUE,
      companyId: eq.companyId,
      entityType: "Equipment",
      entityId: eq.id,
      variables: {
        equipmentId: eq.id,
        equipmentName: eq.name,
        hoursToService: status.hoursToService != null ? String(status.hoursToService) : "",
        latestMeter: status.latestMeter != null ? String(status.latestMeter) : "",
      },
      timestamp: new Date(),
    });
    notified++;
  }

  return { checked: equipment.length, due, notified };
}

// ─────────────────────────────────────────────────────────────────────────
//  DEPRECIATION RUN — monthly straight-line posting
//
//  postDepreciation exists but nothing ever calls it: without a scheduled
//  run, equipment sits at acquisition cost forever and the balance sheet
//  silently overstates fixed assets. This runs once per calendar month
//  (YYYY-MM) per company: monthly charge = acquisitionCost × annualRate / 12,
//  capped at the asset's remaining book value (never depreciates below 0).
//
//  Idempotent per period — an EQUIPMENT_DEPRECIATION JE already posted for
//  this asset+period skips it, so the cron can safely fire daily.
//  RETIRED/SOLD assets stop depreciating (a sale relieves the asset at its
//  current book value — depreciation beyond that double-counts the loss).
// ─────────────────────────────────────────────────────────────────────────

export async function runDepreciation(input: {
  companyId?: string;
  /** Period "YYYY-MM" — defaults to the current month. */
  period?: string;
  userId?: string;
}) {
  const period = input.period ?? new Date().toISOString().slice(0, 7);
  const periodStart = new Date(`${period}-01T00:00:00.000Z`);
  const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));

  const assets = await prisma.equipment.findMany({
    where: {
      companyId: input.companyId ?? undefined,
      deletedAt: null,
      status: { notIn: ["RETIRED", "SOLD"] },
      annualDepreciationRate: { gt: 0 },
      purchaseDate: { lt: periodEnd },
    },
    select: {
      id: true, companyId: true, assetTag: true, name: true,
      acquisitionCost: true, currentValue: true, annualDepreciationRate: true,
    },
  });

  let posted = 0;
  let skipped = 0;
  const errors: { equipmentId: string; error: string }[] = [];

  for (const eq of assets) {
    try {
      const didPost = await withSerializableTransaction(async (tx) => {
        // Already depreciated this period? (sourceId + period in memo)
        const existing = await tx.journalEntry.findFirst({
          where: {
            sourceType: "EQUIPMENT_DEPRECIATION",
            sourceId: eq.id,
            memo: `Depreciation for period ${period}`,
            status: "POSTED",
          },
          select: { id: true },
        });
        if (existing) return false;

        // Remaining depreciable value = acquisitionCost − Σ posted dep.
        const accum = await tx.journalLine.aggregate({
          where: {
            entityType: "Equipment",
            entityId: eq.id,
            account: { code: ACCT.ACCUM_DEPRECIATION },
            journalEntry: { status: "POSTED" },
          },
          _sum: { credit: true, debit: true },
        });
        const accumDep = new Decimal(accum._sum.credit ?? 0).minus(new Decimal(accum._sum.debit ?? 0));
        const bookValue = new Decimal(eq.acquisitionCost).minus(accumDep);
        if (bookValue.lte(0)) return false;

        const monthly = new Decimal(eq.acquisitionCost)
          .times(eq.annualDepreciationRate!)
          .div(12)
          .toDecimalPlaces(2);
        const amount = Decimal.min(monthly, bookValue);
        if (amount.lte(0)) return false;

        await postDepreciation(tx, {
          companyId: eq.companyId,
          equipmentId: eq.id,
          depreciationAmount: amount,
          period,
          postedById: input.userId,
        });
        await tx.equipment.update({
          where: { id: eq.id },
          data: { currentValue: bookValue.minus(amount) },
        });
        return true;
      });
      if (didPost) posted++; else skipped++;
    } catch (err) {
      errors.push({ equipmentId: eq.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { period, evaluated: assets.length, posted, skipped, errors };
}
