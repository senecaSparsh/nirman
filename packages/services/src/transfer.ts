import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordTransfer, withStockTransaction } from "./stock-ledger";

/**
 * Transfer Service — move materials between stock locations.
 *
 * v1 state machine: DRAFT → COMPLETED (atomic) | DRAFT → CANCELLED
 * Stock moves atomically on COMPLETED (TRANSFER_OUT at source + TRANSFER_IN at destination).
 */

interface CreateTransferInput {
  fromLocationId: string;
  toLocationId: string;
  notes?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
  }[];
}

export async function createTransfer(input: CreateTransferInput) {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("Cannot transfer to the same location");
  }
  if (input.lines.length === 0) throw new Error("Transfer must have at least one line");

  // Validate locations
  const [fromLoc, toLoc] = await Promise.all([
    prisma.stockLocation.findFirst({ where: { id: input.fromLocationId, deletedAt: null } }),
    prisma.stockLocation.findFirst({ where: { id: input.toLocationId, deletedAt: null } }),
  ]);
  if (!fromLoc) throw new Error("Source location not found or deleted");
  if (!toLoc) throw new Error("Destination location not found or deleted");
  if (fromLoc.companyId !== toLoc.companyId) {
    throw new Error("Cannot transfer between different companies");
  }

  // Validate materials + qty
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new Error("One or more materials not found or deleted");
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new Error("Transfer qty must be > 0");
  }

  return prisma.stockTransfer.create({
    data: {
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      notes: input.notes,
      status: "DRAFT",
      lines: {
        create: input.lines.map((l) => ({
          materialId: l.materialId,
          qty: new Decimal(l.qty),
        })),
      },
    },
    include: { lines: true },
  });
}

export async function completeTransfer(transferId: string) {
  return withStockTransaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true },
    });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "DRAFT") {
      throw new Error(`Cannot complete transfer in status ${transfer.status}`);
    }

    // Re-validate stock availability at source (may have changed since DRAFT)
    for (const line of transfer.lines) {
      const item = await tx.stockLocationItem.findUnique({
        where: {
          locationId_materialId: {
            locationId: transfer.fromLocationId,
            materialId: line.materialId,
          },
        },
      });
      const available = item ? new Decimal(item.qty) : new Decimal(0);
      if (available.lt(new Decimal(line.qty))) {
        throw new Error(
          `Insufficient stock for transfer: available ${available}, requested ${line.qty} of material ${line.materialId}`,
        );
      }
    }

    // Execute all transfers atomically
    for (const line of transfer.lines) {
      await recordTransfer(tx, {
        materialId: line.materialId,
        fromLocationId: transfer.fromLocationId,
        toLocationId: transfer.toLocationId,
        qty: new Decimal(line.qty),
        refType: "STOCK_TRANSFER",
        refId: transferId,
      });
    }

    return tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "COMPLETED" },
    });
  });
}

export async function cancelTransfer(transferId: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "DRAFT") {
      throw new Error(`Cannot cancel transfer in status ${transfer.status}`);
    }
    return tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "CANCELLED" },
    });
  });
}
