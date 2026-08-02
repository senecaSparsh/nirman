import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { logAction } from "./audit";
import { postSupplierReturn } from "./gl-posting";

/**
 * Supplier Return Service — return defective/excess materials to suppliers.
 *
 * Flow: DRAFT → SUBMITTED → COMPLETED (goods leave, credit note received) | CANCELLED
 * On COMPLETED: creates RETURN stock movement (stock decreases at source location).
 * Tracks credit note number for accounting reconciliation.
 */

function generateReturnNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `RET-${ymd}-${rand}`;
}

interface CreateSupplierReturnInput {
  supplierId: string;
  companyId: string;
  purchaseOrderId?: string;
  locationId: string;
  notes?: string;
  userId?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    unitCost: Decimal | number | string;
    reason?: string;
  }[];
}

export async function createSupplierReturn(input: CreateSupplierReturnInput) {
  if (input.lines.length === 0) throw new Error("Return must have at least one line");

  // Validate supplier + location
  const [supplier, location] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } }),
    prisma.stockLocation.findFirst({ where: { id: input.locationId, deletedAt: null } }),
  ]);
  if (!supplier) throw new Error("Supplier not found or deleted");
  if (!location) throw new Error("Location not found or deleted");
  if (location.companyId !== input.companyId) throw new Error("Location doesn't belong to this company");

  // Validate materials
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new Error("One or more materials not found or deleted");
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new Error("Return qty must be > 0");
  }

  return prisma.$transaction(async (tx) => {
    const ret = await tx.supplierReturn.create({
      data: {
        returnNumber: generateReturnNumber(),
        supplierId: input.supplierId,
        companyId: input.companyId,
        purchaseOrderId: input.purchaseOrderId,
        locationId: input.locationId,
        notes: input.notes,
        status: "DRAFT",
        lines: {
          create: input.lines.map((l) => ({
            materialId: l.materialId,
            qty: new Decimal(l.qty),
            unitCost: new Decimal(l.unitCost),
            reason: l.reason,
          })),
        },
      },
      include: { lines: true },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "SUPPLIER_RETURN_CREATE",
      entityType: "SupplierReturn",
      entityId: ret.id,
      after: { returnNumber: ret.returnNumber, supplierId: input.supplierId, status: "DRAFT", lineCount: input.lines.length },
    });
    return ret;
  });
}

export async function submitSupplierReturn(returnId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const ret = await tx.supplierReturn.findUnique({ where: { id: returnId } });
    if (!ret) throw new Error("Return not found");
    if (ret.status !== "DRAFT") throw new Error(`Cannot submit return in status ${ret.status}`);
    const updated = await tx.supplierReturn.update({ where: { id: returnId }, data: { status: "SUBMITTED" } });
    await logAction(tx, {
      userId,
      action: "SUPPLIER_RETURN_SUBMIT",
      entityType: "SupplierReturn",
      entityId: returnId,
      before: { status: "DRAFT" },
      after: { status: "SUBMITTED" },
    });
    return updated;
  });
}

interface CompleteSupplierReturnInput {
  returnId: string;
  creditNoteNo?: string;
  userId?: string;
}

export async function completeSupplierReturn(input: CompleteSupplierReturnInput) {
  return withStockTransaction(async (tx) => {
    const ret = await tx.supplierReturn.findUnique({
      where: { id: input.returnId },
      include: { lines: true },
    });
    if (!ret) throw new Error("Return not found");
    if (ret.status !== "SUBMITTED") throw new Error(`Cannot complete return in status ${ret.status}`);

    // Validate stock availability for each line
    for (const line of ret.lines) {
      const item = await tx.stockLocationItem.findUnique({
        where: {
          locationId_materialId: {
            locationId: ret.locationId,
            materialId: line.materialId,
          },
        },
      });
      const available = item ? new Decimal(item.qty) : new Decimal(0);
      if (available.lt(new Decimal(line.qty))) {
        throw new Error(
          `Insufficient stock for return: available ${available}, returning ${line.qty} of material ${line.materialId}`,
        );
      }
    }

    // Record RETURN movements (stock leaves the location back to supplier)
    for (const line of ret.lines) {
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "RETURN",
        fromLocationId: ret.locationId,
        qty: new Decimal(line.qty),
        reason: `Return to supplier: ${line.reason ?? "N/A"}`,
        refType: "SUPPLIER_RETURN",
        refId: ret.id,
        userId: input.userId,
      });
    }

    // Refresh currentCost for affected materials
    await refreshMaterialCurrentCost(tx, ret.lines.map((l) => l.materialId));

    // Post to the General Ledger: relieve AP, return stock to inventory, reverse input GST.
    // Uses each material's gstRate (the return line doesn't carry its own rate).
    const materialsForGl = await tx.material.findMany({
      where: { id: { in: ret.lines.map((l) => l.materialId) } },
      select: { id: true, gstRate: true },
    });
    const gstByMaterial = new Map(materialsForGl.map((m) => [m.id, new Decimal(m.gstRate)]));
    await postSupplierReturn(tx, {
      companyId: ret.companyId,
      supplierReturnId: ret.id,
      postedById: input.userId,
      lines: ret.lines.map((l) => ({
        qty: new Decimal(l.qty),
        unitCost: new Decimal(l.unitCost),
        gstRate: gstByMaterial.get(l.materialId) ?? new Decimal(0),
      })),
    });

    const updated = await tx.supplierReturn.update({
      where: { id: input.returnId },
      data: {
        status: "COMPLETED",
        creditNoteNo: input.creditNoteNo,
      },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "SUPPLIER_RETURN_COMPLETE",
      entityType: "SupplierReturn",
      entityId: input.returnId,
      before: { status: "SUBMITTED" },
      after: { status: "COMPLETED", creditNoteNo: input.creditNoteNo ?? null },
    });
    return updated;
  });
}

export async function cancelSupplierReturn(returnId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const ret = await tx.supplierReturn.findUnique({ where: { id: returnId } });
    if (!ret) throw new Error("Return not found");
    if (ret.status === "COMPLETED") throw new Error("Cannot cancel a completed return");
    const updated = await tx.supplierReturn.update({ where: { id: returnId }, data: { status: "CANCELLED" } });
    await logAction(tx, {
      userId,
      action: "SUPPLIER_RETURN_CANCEL",
      entityType: "SupplierReturn",
      entityId: returnId,
      before: { status: ret.status },
      after: { status: "CANCELLED" },
    });
    return updated;
  });
}
