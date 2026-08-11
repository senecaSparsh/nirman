import Decimal from "decimal.js";

/**
 * Moving Average Cost (MAC) calculation.
 *
 * When stock is received (PURCHASE_RECEIPT, TRANSFER_IN, ADJUSTMENT_IN):
 *   newMAC = (oldQty × oldMAC + receivedQty × receivedUnitCost) / (oldQty + receivedQty)
 *
 * When stock is issued (ISSUE_TO_PROJECT, ISSUE_TO_DEPARTMENT, TRANSFER_OUT,
 * ADJUSTMENT_OUT, RETURN, SALE):
 *   MAC does not change — issues draw from stock at the current MAC.
 *   The issue's unitCost = the current MAC (captured in StockMovement.unitCost).
 *
 * This is a pure function — no DB access. The stockLedgerService calls it and
 * persists the result to StockLocationItem.movingAvgCost.
 */
export function computeMovingAverageCost(
  oldQty: Decimal,
  oldMAC: Decimal,
  receivedQty: Decimal,
  receivedUnitCost: Decimal,
): Decimal {
  const oldQtyN = new Decimal(oldQty);
  const oldMACN = new Decimal(oldMAC);
  const recvQtyN = new Decimal(receivedQty);
  const recvCostN = new Decimal(receivedUnitCost);

  if (oldMACN.lt(0)) throw new Error("Old MAC cannot be negative");
  if (recvCostN.lt(0)) throw new Error("Received unit cost cannot be negative");

  const newQty = oldQtyN.plus(recvQtyN);
  if (newQty.isZero()) {
    throw new Error("Cannot compute MAC: total quantity is zero (both old and received quantities are zero)");
  }

  const totalValue = oldQtyN.times(oldMACN).plus(recvQtyN.times(recvCostN));
  return totalValue.div(newQty);
}

/**
 * After an issue (qty removed), the MAC stays the same but the total value drops.
 * Returns the new total stock value = remainingQty × MAC.
 */
export function stockValueAfterIssue(
  remainingQty: Decimal,
  mac: Decimal,
): Decimal {
  return new Decimal(remainingQty).times(new Decimal(mac));
}

export type MovementDirection = "IN" | "OUT";

/**
 * Classifies a StockMovementType as inbound or outbound for a given location.
 * PURCHASE_RECEIPT → IN (toLocation)
 * TRANSFER_IN → IN (toLocation)
 * ADJUSTMENT_IN → IN (toLocation)
 * RETURN → OUT (fromLocation) — supplier return: goods leave the warehouse
 * TRANSFER_OUT → OUT (fromLocation)
 * ISSUE_TO_PROJECT → OUT (fromLocation)
 * ISSUE_TO_DEPARTMENT → OUT (fromLocation)
 * ADJUSTMENT_OUT → OUT (fromLocation)
 * SALE → OUT (fromLocation)
 */
export function movementDirection(
  type: string,
): MovementDirection {
  switch (type) {
    case "PURCHASE_RECEIPT":
    case "TRANSFER_IN":
    case "ADJUSTMENT_IN":
    case "SCRAP_GENERATED":
      return "IN";
    case "TRANSFER_OUT":
    case "ISSUE_TO_PROJECT":
    case "ISSUE_TO_DEPARTMENT":
    case "ADJUSTMENT_OUT":
    case "RETURN":
    case "SALE":
      return "OUT";
    default:
      throw new Error(`Unknown StockMovementType: ${type}`);
  }
}
