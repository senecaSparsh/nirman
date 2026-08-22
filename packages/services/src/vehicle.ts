import { prisma } from "@nirman/db";
import { Prisma } from "@nirman/db";

/**
 * Vehicle master + trip log service.
 *
 * Every goods movement (receive, issue, sell, transfer, return, direct
 * purchase) involves a vehicle. This service:
 *  1. Auto-creates/updates the Vehicle master from usage
 *  2. Logs a VehicleTrip linking the vehicle to the movement
 *  3. Provides lookup for autocomplete (by vehicle number)
 */

export const VEHICLE_TYPES = [
  "TRUCK",
  "TEMPO",
  "PICKUP",
  "TRACTOR",
  "MINI_TRUCK",
  "AUTO",
  "CAR",
  "BIKE",
  "CYCLE",
  "HAND_CART",
  "PORTER",
  "OTHER",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRUCK: "Truck (16-wheeler)",
  TEMPO: "Tempo",
  PICKUP: "Pickup",
  TRACTOR: "Tractor Trolley",
  MINI_TRUCK: "Mini Truck",
  AUTO: "Auto Rickshaw",
  CAR: "Car",
  BIKE: "Bike",
  CYCLE: "Cycle",
  HAND_CART: "Hand Cart",
  PORTER: "Porter (on shoulder)",
  OTHER: "Other",
};

export interface VehicleTripInput {
  vehicleNumber: string;
  vehicleType: string;
  photoUrl?: string;
  driverName?: string;
  driverPhone?: string;
  transporterName?: string;
  movementType: string; // PURCHASE_RECEIPT | STOCK_TRANSFER | etc.
  refType: string; // "GoodsReceipt" | "StockTransfer" | etc.
  refId: string;
  fromLocationId?: string;
  toLocationId?: string;
  photos?: unknown; // JSON array
  companyId: string;
  tx?: Prisma.TransactionClient; // optional: use existing transaction
}

/**
 * Record a vehicle trip — auto-creates/updates the Vehicle master,
 * then creates a VehicleTrip log entry. Should be called inside the
 * same transaction as the movement it's linked to.
 */
export async function recordVehicleTrip(input: VehicleTripInput) {
  const client = input.tx ?? prisma;
  if (!input.vehicleNumber?.trim()) return null;

  const vehicleNumber = input.vehicleNumber.trim().toUpperCase();

  // 1. Upsert the Vehicle master (auto-build from usage)
  const vehicle = await client.vehicle.upsert({
    where: {
      vehicleNumber_companyId: {
        vehicleNumber,
        companyId: input.companyId,
      },
    },
    create: {
      vehicleNumber,
      vehicleType: input.vehicleType || "OTHER",
      photoUrl: input.photoUrl,
      driverName: input.driverName,
      driverPhone: input.driverPhone,
      transporterName: input.transporterName,
      companyId: input.companyId,
      tripCount: 1,
      lastUsedAt: new Date(),
      lastLocationId: input.toLocationId ?? input.fromLocationId,
    },
    update: {
      // Update photo/driver if new info is provided
      photoUrl: input.photoUrl ?? undefined,
      vehicleType: input.vehicleType || undefined,
      driverName: input.driverName ?? undefined,
      driverPhone: input.driverPhone ?? undefined,
      transporterName: input.transporterName ?? undefined,
      tripCount: { increment: 1 },
      lastUsedAt: new Date(),
      lastLocationId: input.toLocationId ?? input.fromLocationId ?? undefined,
    },
  });

  // 2. Create the trip log
  const trip = await client.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      movementType: input.movementType,
      refType: input.refType,
      refId: input.refId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      driverName: input.driverName,
      driverPhone: input.driverPhone,
      transporterName: input.transporterName,
      photos: input.photos as never,
      companyId: input.companyId,
    },
  });

  return { vehicle, trip };
}

/**
 * Search vehicles by number — for autocomplete in forms.
 * Returns matching vehicles with last-used info for auto-fill.
 */
export async function searchVehicles(companyId: string, query: string, limit = 10) {
  if (!query.trim()) return [];
  return prisma.vehicle.findMany({
    where: {
      companyId,
      deletedAt: null,
      vehicleNumber: { contains: query.trim().toUpperCase(), mode: "insensitive" },
    },
    select: {
      id: true,
      vehicleNumber: true,
      vehicleType: true,
      photoUrl: true,
      driverName: true,
      driverPhone: true,
      transporterName: true,
      tripCount: true,
      lastUsedAt: true,
    },
    take: limit,
    orderBy: { lastUsedAt: "desc" },
  });
}

/**
 * Get a vehicle's trip history.
 */
export async function getVehicleHistory(vehicleId: string, limit = 50) {
  return prisma.vehicleTrip.findMany({
    where: { vehicleId },
    include: {
      vehicle: { select: { vehicleNumber: true, vehicleType: true, photoUrl: true } },
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

/**
 * List all vehicles for a company with trip stats.
 */
export async function listVehicles(companyId: string) {
  return prisma.vehicle.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
}
