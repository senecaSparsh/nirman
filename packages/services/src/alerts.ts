import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { postNrvWriteDown } from "./gl-posting";

/**
 * Alerts & Reporting Service — low-stock alerts, inventory aging, NRV flagging.
 *
 * These are read-only analytical functions (except NRV flagging which writes).
 */

/**
 * Low-stock alerts: materials where total stock across all locations ≤ reorderPoint.
 * Returns materials that need reordering, with current total stock and suggested order qty (EOQ).
 */
export async function lowStockAlerts(companyId?: string) {
  const materials = await prisma.material.findMany({
    where: {
      deletedAt: null,
      reorderPoint: { not: null },
      ...(companyId ? { stockItems: { some: { location: { companyId } } } } : {}),
    },
    include: {
      stockItems: {
        where: { location: { deletedAt: null } },
        select: { qty: true },
      },
    },
  });

  const alerts = [];
  for (const material of materials) {
    const totalStock = material.stockItems.reduce(
      (sum, item) => sum.plus(new Decimal(item.qty)),
      new Decimal(0),
    );
    const reorderPoint = new Decimal(material.reorderPoint ?? 0);

    if (totalStock.lte(reorderPoint)) {
      alerts.push({
        materialId: material.id,
        code: material.code,
        name: material.name,
        unit: material.unit,
        totalStock,
        reorderPoint,
        minStock: material.minStock ? new Decimal(material.minStock) : null,
        suggestedOrderQty: material.economicOrderQty ? new Decimal(material.economicOrderQty) : null,
        isCritical: material.minStock ? totalStock.lte(new Decimal(material.minStock)) : false,
      });
    }
  }

  // Sort: critical first, then by stock level ascending
  alerts.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    return a.totalStock.comparedTo(b.totalStock);
  });

  return alerts;
}

/**
 * Inventory aging: how long materials have been sitting at each location.
 * Groups stock by age buckets: <30d, 30-60d, 60-90d, >90d.
 * Based on the last PURCHASE_RECEIPT or TRANSFER_IN movement timestamp.
 */
export async function inventoryAgingReport(companyId?: string) {
  const items = await prisma.stockLocationItem.findMany({
    where: {
      qty: { gt: 0 },
      location: { deletedAt: null, ...(companyId ? { companyId } : {}) },
      material: { deletedAt: null },
    },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      location: { select: { id: true, name: true, type: true } },
    },
  });

  // Batch fetch all relevant inbound movements (avoids N+1 — one query instead of N)
  const allMovements = await prisma.stockMovement.findMany({
    where: {
      materialId: { in: items.map((i) => i.materialId) },
      toLocationId: { in: items.map((i) => i.locationId) },
      movementType: { in: ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN"] },
    },
    orderBy: { timestamp: "desc" },
    select: { materialId: true, toLocationId: true, timestamp: true },
  });

  // Build a map of latest movement per (materialId, locationId) pair
  const latestMovementMap = new Map<string, Date>();
  for (const m of allMovements) {
    const key = `${m.materialId}-${m.toLocationId}`;
    // Movements are ordered desc, so the first one we see for each key is the latest
    if (!latestMovementMap.has(key)) {
      latestMovementMap.set(key, m.timestamp);
    }
  }

  const report = [];
  for (const item of items) {
    const key = `${item.materialId}-${item.locationId}`;
    const lastInboundDate = latestMovementMap.get(key);
    if (!lastInboundDate) continue;

    const ageDays = Math.floor((Date.now() - lastInboundDate.getTime()) / (1000 * 60 * 60 * 24));
    let bucket: string;
    if (ageDays < 30) bucket = "<30d";
    else if (ageDays < 60) bucket = "30-60d";
    else if (ageDays < 90) bucket = "60-90d";
    else bucket = ">90d";

    report.push({
      materialId: item.material.id,
      materialCode: item.material.code,
      materialName: item.material.name,
      unit: item.material.unit,
      locationId: item.location.id,
      locationName: item.location.name,
      locationType: item.location.type,
      qty: new Decimal(item.qty),
      mac: new Decimal(item.movingAvgCost),
      value: new Decimal(item.qty).times(new Decimal(item.movingAvgCost)),
      lastInboundDate,
      ageDays,
      bucket,
      isSlowMoving: ageDays > 90,
    });
  }

  // Sort: oldest first
  report.sort((a, b) => b.ageDays - a.ageDays);

  return report;
}

/**
 * NRV (Net Realizable Value) write-down flagging.
 * For unsold assets where currentValuation < cost basis, flag the write-down amount.
 * IAS 2: inventory at lower of cost or NRV.
 *
 * For BuiltUnits: costBasis = productionCost, NRV = currentValuation
 * For LandParcels: costBasis = acquisitionCost, NRV = currentValuation
 *
 * If NRV < cost → nrvWriteDown = cost - NRV (the amount to write down).
 *
 * Phase 3E: now also posts a GL entry for each write-down —
 * Dr OPERATING_EXPENSE (6000), Cr UNIT_ASSET (1800) / LAND_ASSET (1700).
 * Only the incremental delta is posted (new write-down minus any existing).
 */
export async function flagNrvWriteDowns(companyId?: string) {
  const [units, parcels] = await Promise.all([
    prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        ...(companyId ? { project: { companyId } } : {}),
      },
      select: { id: true, productionCost: true, currentValuation: true, nrvWriteDown: true, project: { select: { companyId: true } } },
    }),
    prisma.landParcel.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        ...(companyId ? { landPurchase: { companyId } } : {}),
      },
      select: { id: true, acquisitionCost: true, currentValuation: true, landPurchase: { select: { companyId: true } } },
    }),
  ]);

  const writeDowns: {
    type: "BUILT_UNIT" | "LAND";
    id: string;
    costBasis: Decimal;
    nrv: Decimal;
    writeDownAmount: Decimal;
  }[] = [];

  // Collect all updates + GL postings first, then apply atomically
  const unitUpdates: { id: string; nrvWriteDown: Decimal; companyId: string; glAmount: Decimal }[] = [];
  const parcelUpdates: { id: string; nrvWriteDown: Decimal; companyId: string; glAmount: Decimal }[] = [];

  // Built units
  for (const unit of units) {
    const cost = new Decimal(unit.productionCost);
    const nrv = new Decimal(unit.currentValuation);
    const existingWriteDown = unit.nrvWriteDown ? new Decimal(unit.nrvWriteDown) : new Decimal(0);
    if (nrv.lt(cost)) {
      const writeDown = cost.minus(nrv);
      writeDowns.push({ type: "BUILT_UNIT", id: unit.id, costBasis: cost, nrv, writeDownAmount: writeDown });
      // GL delta = new write-down minus existing (only post the incremental amount)
      const glAmount = writeDown.minus(existingWriteDown);
      unitUpdates.push({ id: unit.id, nrvWriteDown: writeDown, companyId: unit.project.companyId, glAmount });
    } else if (existingWriteDown.gt(0)) {
      // Clear previous write-down if NRV has recovered
      unitUpdates.push({ id: unit.id, nrvWriteDown: new Decimal(0), companyId: unit.project.companyId, glAmount: new Decimal(0) });
    }
  }

  // Land parcels
  for (const parcel of parcels) {
    const cost = new Decimal(parcel.acquisitionCost);
    const nrv = new Decimal(parcel.currentValuation);
    if (nrv.lt(cost)) {
      const writeDown = cost.minus(nrv);
      writeDowns.push({ type: "LAND", id: parcel.id, costBasis: cost, nrv, writeDownAmount: writeDown });
      parcelUpdates.push({ id: parcel.id, nrvWriteDown: writeDown, companyId: parcel.landPurchase.companyId, glAmount: writeDown });
    }
  }

  // Apply all updates + GL postings in a single transaction
  if (unitUpdates.length > 0 || parcelUpdates.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const u of unitUpdates) {
        await tx.builtUnit.update({ where: { id: u.id }, data: { nrvWriteDown: u.nrvWriteDown } });
        if (u.glAmount.gt(0)) {
          await postNrvWriteDown(tx, {
            companyId: u.companyId,
            entityType: "BUILT_UNIT",
            entityId: u.id,
            writeDownAmount: u.glAmount,
          });
        }
      }
      for (const p of parcelUpdates) {
        await tx.landParcel.update({ where: { id: p.id }, data: { nrvWriteDown: p.nrvWriteDown } });
        if (p.glAmount.gt(0)) {
          await postNrvWriteDown(tx, {
            companyId: p.companyId,
            entityType: "LAND",
            entityId: p.id,
            writeDownAmount: p.glAmount,
          });
        }
      }
    });
  }

  return writeDowns;
}

/**
 * Pure function: compute NRV write-down amount.
 */
export function computeNrvWriteDown(costBasis: Decimal, nrv: Decimal): Decimal {
  const cost = new Decimal(costBasis);
  const netRealizableValue = new Decimal(nrv);
  if (netRealizableValue.lt(cost)) {
    return cost.minus(netRealizableValue);
  }
  return new Decimal(0);
}

/**
 * Lease expiry alerts: leasehold land purchases where the lease end date is
 * approaching (within 90/60/30 days) or has already expired.
 *
 * Returns land purchases with landType=LEASEHOLD, a non-null leaseEndDate,
 * and the lease still active (not soft-deleted). Each alert includes the
 * days until expiry and a severity bucket.
 */
export async function leaseExpiryAlerts(companyId?: string) {
  const now = new Date();
  const purchases = await prisma.landPurchase.findMany({
    where: {
      deletedAt: null,
      landType: "LEASEHOLD",
      leaseEndDate: { not: null },
      ...(companyId ? { companyId } : {}),
    },
    select: {
      id: true,
      sellerName: true,
      location: true,
      registryNo: true,
      totalCost: true,
      leaseEndDate: true,
      leaseStartDate: true,
      leaseType: true,
      companyId: true,
      project: { select: { id: true, name: true } },
    },
  });

  const alerts = [];
  for (const lp of purchases) {
    if (!lp.leaseEndDate) continue;
    const daysUntilExpiry = Math.floor(
      (lp.leaseEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    let severity: "EXPIRED" | "CRITICAL" | "WARNING" | "INFO";
    if (daysUntilExpiry < 0) severity = "EXPIRED";
    else if (daysUntilExpiry <= 30) severity = "CRITICAL";
    else if (daysUntilExpiry <= 60) severity = "WARNING";
    else if (daysUntilExpiry <= 90) severity = "INFO";
    else continue; // more than 90 days — not an alert

    alerts.push({
      landPurchaseId: lp.id,
      sellerName: lp.sellerName,
      location: lp.location,
      registryNo: lp.registryNo,
      totalCost: new Decimal(lp.totalCost),
      leaseEndDate: lp.leaseEndDate,
      leaseStartDate: lp.leaseStartDate,
      leaseType: lp.leaseType,
      projectName: lp.project?.name ?? null,
      daysUntilExpiry,
      severity,
    });
  }

  // Sort: expired first, then by days until expiry ascending
  alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return alerts;
}

/**
 * Unsold land aging report: how long land parcels have been sitting unsold.
 * Groups parcels by age buckets based on the parent land purchase date.
 * Only includes AVAILABLE and HOLD parcels (not SOLD, RESERVED, RENTED, PARTITIONED).
 *
 * Buckets: <1yr, 1-2yr, 2-5yr, 5+yr since purchase.
 */
export async function unsoldLandAgingReport(companyId?: string) {
  const parcels = await prisma.landParcel.findMany({
    where: {
      deletedAt: null,
      status: { in: ["AVAILABLE", "HOLD"] },
      ...(companyId ? { landPurchase: { companyId } } : {}),
    },
    include: {
      landPurchase: {
        select: {
          id: true,
          purchaseDate: true,
          sellerName: true,
          location: true,
          totalCost: true,
        },
      },
      project: { select: { id: true, name: true } },
    },
  });

  const now = Date.now();
  const report = [];
  for (const parcel of parcels) {
    const purchaseDate = parcel.landPurchase.purchaseDate;
    const ageDays = Math.floor((now - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
    const ageYears = ageDays / 365.25;

    let bucket: string;
    if (ageYears < 1) bucket = "<1yr";
    else if (ageYears < 2) bucket = "1-2yr";
    else if (ageYears < 5) bucket = "2-5yr";
    else bucket = "5+yr";

    report.push({
      parcelId: parcel.id,
      parcelNumber: parcel.number,
      area: new Decimal(parcel.area),
      areaUnit: parcel.areaUnit,
      acquisitionCost: new Decimal(parcel.acquisitionCost),
      currentValuation: new Decimal(parcel.currentValuation),
      askingPrice: parcel.askingPrice ? new Decimal(parcel.askingPrice) : null,
      status: parcel.status,
      purpose: parcel.purpose,
      projectName: parcel.project?.name ?? null,
      landPurchaseId: parcel.landPurchase.id,
      sellerName: parcel.landPurchase.sellerName,
      location: parcel.landPurchase.location,
      purchaseDate,
      ageDays,
      ageYears: Math.round(ageYears * 10) / 10,
      bucket,
      isStale: ageYears >= 2,
      potentialLoss: parcel.currentValuation.lt(parcel.acquisitionCost)
        ? new Decimal(parcel.acquisitionCost).minus(new Decimal(parcel.currentValuation))
        : new Decimal(0),
    });
  }

  // Sort: oldest first
  report.sort((a, b) => b.ageDays - a.ageDays);
  return report;
}
