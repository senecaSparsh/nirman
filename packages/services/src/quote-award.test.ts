import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@nirman/db";
import { withSerializableTransaction } from "./transaction";
import {
  getComparativeStatement,
  selectWinningQuote,
  updateVendorQuote,
  deleteVendorQuote,
  validateQuoteLandedTotal,
  validateQuoteLineCoverage,
} from "./quote-comparison";

vi.mock("./transaction", async (importOriginal) => ({
  ...await importOriginal<typeof import("./transaction")>(),
  withSerializableTransaction: vi.fn(),
}));
vi.mock("./audit", () => ({ logAction: vi.fn() }));

const requisition = {
  id: "qa-indent", reqNumber: "QA-INDENT", status: "APPROVED", minQuotesRequired: 3,
  quotesWaived: false, quotesLockedAt: null as Date | null, lines: [{ materialId: "qa-material" }],
};
function makeQuotes() {
  return [350, 365, 380].map((price, i) => ({
    id: `q${i}`, supplierId: `supplier${i}`, status: "PENDING", landedTotal: new Decimal(price * 7 * 1.28),
    supplier: { id: `supplier${i}`, name: `QA supplier ${i}`, phone: null }, lines: [],
  }));
}
let quotes = makeQuotes();
const tx = {
  vendorQuote: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  vendorQuoteLine: { deleteMany: vi.fn() },
  materialRequisition: { update: vi.fn() },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Object.assign(requisition, { status: "APPROVED", quotesWaived: false, quotesLockedAt: null });
  quotes = makeQuotes();
  tx.vendorQuote.findUnique.mockImplementation(async ({ where }) => ({ ...quotes.find(q => q.id === where.id), requisitionId: requisition.id, requisition }));
  tx.vendorQuote.findMany.mockImplementation(async () => quotes);
  tx.vendorQuote.update.mockImplementation(async ({ where, data }) => ({ ...quotes.find(q => q.id === where.id), ...data }));
  vi.mocked(withSerializableTransaction).mockImplementation(async fn => fn(tx as unknown as Prisma.TransactionClient));
  vi.spyOn(prisma.materialRequisition, "findUnique").mockResolvedValue(requisition as never);
  vi.spyOn(prisma.vendorQuote, "findMany").mockResolvedValue(quotes as never);
  vi.spyOn(prisma.purchaseOrderLine, "findMany").mockResolvedValue([]);
});

describe("quote award safeguards", () => {
  it("blocks awarding before the minimum quotes are collected", async () => {
    quotes = quotes.slice(0, 1);
    await expect(selectWinningQuote({ quoteId: "q0" })).rejects.toThrow(/quote.*required|quote gate/i);
    expect(tx.vendorQuote.updateMany).not.toHaveBeenCalled();
    expect(tx.materialRequisition.update).not.toHaveBeenCalled();
  });

  it("requires a reason when the winner is not cheapest", async () => {
    await expect(selectWinningQuote({ quoteId: "q1" })).rejects.toThrow(/reason/i);
    expect(tx.vendorQuote.updateMany).not.toHaveBeenCalled();
  });

  it("permits a justified non-cheapest winner", async () => {
    const result = await selectWinningQuote({ quoteId: "q1", selectionReason: "Verified earlier delivery" });
    expect(result.status).toBe("SELECTED");
  });

  it("permits an explicitly waived single-source award", async () => {
    quotes = quotes.slice(0, 1);
    requisition.quotesWaived = true;
    expect((await selectWinningQuote({ quoteId: "q0" })).status).toBe("SELECTED");
  });

  it("does not count revisions from the same supplier as independent bids", async () => {
    quotes[1]!.supplierId = quotes[0]!.supplierId;
    await expect(selectWinningQuote({ quoteId: "q0" })).rejects.toThrow(/quote gate/i);
  });

  it("allows an equally cheapest quote without an override reason", async () => {
    quotes[1]!.landedTotal = quotes[0]!.landedTotal;
    expect((await selectWinningQuote({ quoteId: "q1" })).status).toBe("SELECTED");
  });

  it("requires an approved indent before awarding", async () => {
    requisition.status = "SUBMITTED";
    await expect(selectWinningQuote({ quoteId: "q0" })).rejects.toThrow(/approved/i);
    expect(tx.vendorQuote.updateMany).not.toHaveBeenCalled();
  });
});

describe("quote pricing integrity", () => {
  it("rejects an entered quote total that does not match itemized lines", () => {
    expect(() => validateQuoteLandedTotal(448, new Decimal(467.2))).toThrow(/does not match/i);
    expect(validateQuoteLandedTotal(undefined, new Decimal(467.2))).toEqual(new Decimal("467.20"));
  });

  it("compares quote totals at stored currency precision", () => {
    expect(validateQuoteLandedTotal(142.10, new Decimal("142.1001"))).toEqual(new Decimal("142.10"));
  });

  it("requires exact material and quantity coverage for the indent", () => {
    expect(() => validateQuoteLineCoverage(
      [{ materialId: "cement", qty: 3 }],
      [{ materialId: "cement", qtyRequested: new Decimal(3) }],
    )).not.toThrow();
    expect(() => validateQuoteLineCoverage(
      [{ materialId: "cement", qty: 2 }],
      [{ materialId: "cement", qtyRequested: new Decimal(3) }],
    )).toThrow(/quantity/i);
    expect(() => validateQuoteLineCoverage(
      [{ materialId: "cement", qty: 3 }],
      [
        { materialId: "cement", qtyRequested: new Decimal(3) },
        { materialId: "steel", qtyRequested: new Decimal(10) },
      ],
    )).toThrow(/cover each material/i);
  });
});

describe("awarded comparison history", () => {
  it("refuses edits to a losing bid after award", async () => {
    requisition.quotesLockedAt = new Date();
    quotes[1]!.status = "REJECTED";
    await expect(updateVendorQuote({ quoteId: "q1", notes: "Changed after award" })).rejects.toThrow(/locked/i);
    expect(tx.vendorQuote.update).not.toHaveBeenCalled();
  });

  it("refuses deletion of a losing bid after award", async () => {
    requisition.quotesLockedAt = new Date();
    quotes[1]!.status = "REJECTED";
    await expect(deleteVendorQuote("q1")).rejects.toThrow(/locked/i);
    expect(tx.vendorQuoteLine.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["edit", "delete"])("refuses %s on approved standalone quotation history", async action => {
    tx.vendorQuote.findUnique.mockResolvedValueOnce({
      ...quotes[1], requisitionId: null, requisition: null, quotationRequestId: "qa-request", quotationRequest: { status: "APPROVED" },
    });
    const operation = action === "edit" ? updateVendorQuote({ quoteId: "q1", notes: "Changed" }) : deleteVendorQuote("q1");
    await expect(operation).rejects.toThrow(/locked/i);
  });

  it("retains all quotes and a satisfied gate after award", async () => {
    requisition.status = "CONVERTED";
    requisition.quotesLockedAt = new Date("2026-10-06T00:00:00Z");
    quotes[0]!.status = "SELECTED";
    quotes[1]!.status = "REJECTED";
    quotes[2]!.status = "REJECTED";
    const statement = await getComparativeStatement(requisition.id);
    expect(statement.quotes).toHaveLength(3);
    expect(statement.gateSatisfied).toBe(true);
    expect(statement.quoteCount).toBe(3);
    expect(statement.cheapestQuoteId).toBe("q0");
    expect(statement.quotes[2]!.varianceVsCheapest).toBeCloseTo(268.8);
  });

  it("retains the cheapest historical quote when a higher quote won", async () => {
    requisition.quotesLockedAt = new Date("2026-10-06T00:00:00Z");
    quotes[0]!.status = "REJECTED";
    quotes[1]!.status = "SELECTED";
    quotes[2]!.status = "REJECTED";
    const statement = await getComparativeStatement(requisition.id);
    expect(statement.selectedQuoteId).toBe("q1");
    expect(statement.cheapestQuoteId).toBe("q0");
  });
});
