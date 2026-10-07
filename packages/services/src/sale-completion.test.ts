import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@nirman/db";
import { withSerializableTransaction } from "./transaction";
import { completeSale } from "./sale";
import { postAssetSale, postJournalEntry, postPaymentReceived } from "./gl-posting";

vi.mock("./transaction", async (importOriginal) => ({
  ...await importOriginal<typeof import("./transaction")>(),
  withSerializableTransaction: vi.fn(),
}));
vi.mock("./gl-posting", async (importOriginal) => ({
  ...await importOriginal<typeof import("./gl-posting")>(),
  postAssetSale: vi.fn(),
  postJournalEntry: vi.fn(),
  postPaymentReceived: vi.fn(),
}));

function makeSale() {
  return {
    id: "qa-sale", companyId: "qa-company", assetType: "LAND", landParcelId: "qa-parcel",
    builtUnitId: null, projectId: null as string | null, project: null, status: "ACTIVE", saleStage: "DEPOSIT_RECEIVED",
    salePrice: new Decimal(2400000), gstAmount: new Decimal(0), costBasis: new Decimal(1000000),
    atsDocumentUrl: "/api/uploads/qa-agreement" as string | null, bbaDocumentUrl: null,
    registryDocumentUrl: "/api/uploads/qa-registry",
    payments: [{ amount: new Decimal(700000), status: "RECEIVED" }],
  };
}

let sale = makeSale();
const tx = {
  assetSale: { findUnique: vi.fn(), update: vi.fn() },
  assetSalePayment: { create: vi.fn(), findFirst: vi.fn() },
  landParcel: { update: vi.fn() },
  paymentSchedule: { findFirst: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  sale = makeSale();
  tx.assetSale.findUnique.mockImplementation(async () => sale);
  tx.assetSale.update.mockResolvedValue({});
  tx.assetSalePayment.create.mockResolvedValue({ id: "qa-payment" });
  tx.assetSalePayment.findFirst.mockResolvedValue({ id: "qa-payment" });
  tx.paymentSchedule.findFirst.mockResolvedValue(null);
  vi.mocked(withSerializableTransaction).mockImplementation(async (fn) => fn(tx as unknown as Prisma.TransactionClient));
  vi.spyOn(prisma.journalEntry, "findMany").mockResolvedValue([]);
  vi.spyOn(prisma.journalEntry, "findFirst").mockResolvedValue(null);
});

describe("sale completion payment accounting", () => {
  it.each([0, "0", new Decimal(0)])("preserves explicit zero final payment (%s)", async (finalPaymentAmount) => {
    const result = await completeSale({ saleId: sale.id, finalPaymentAmount });
    expect(tx.assetSalePayment.create).not.toHaveBeenCalled();
    expect(postPaymentReceived).not.toHaveBeenCalled();
    expect(tx.assetSale.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ saleStage: "COMPLETED", paymentStatus: "PARTIAL" }),
    }));
    expect(result.paymentStatus).toBe("PARTIAL");
    expect(postAssetSale).toHaveBeenCalledOnce();
    expect(postJournalEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceType: "ASSET_SALE_DEPOSIT_SETTLE",
      lines: expect.arrayContaining([expect.objectContaining({ debit: new Decimal(700000) })]),
    }));
  });

  it("defaults an omitted final payment to the outstanding balance", async () => {
    const result = await completeSale({ saleId: sale.id });
    expect(tx.assetSalePayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: new Decimal(1700000) }),
    }));
    expect(result.paymentStatus).toBe("PAID");
  });

  it("returns the persisted partial status for a partial final payment", async () => {
    const result = await completeSale({ saleId: sale.id, finalPaymentAmount: 100000 });
    expect(result.paymentStatus).toBe("PARTIAL");
    expect(postPaymentReceived).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amount: new Decimal(100000) }));
  });

  it("does not include voided payments in the outstanding balance", async () => {
    sale.payments.push({ amount: new Decimal(100000), status: "VOID" });
    await completeSale({ saleId: sale.id });
    expect(tx.assetSalePayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: new Decimal(1700000) }),
    }));
  });

  it("allows direct registry for standalone land without inventing a payment", async () => {
    sale.atsDocumentUrl = null;
    const result = await completeSale({ saleId: sale.id, finalPaymentAmount: 0 });
    expect(result.saleStage).toBe("COMPLETED");
    expect(result.paymentStatus).toBe("PARTIAL");
    expect(tx.assetSalePayment.create).not.toHaveBeenCalled();
  });

  it.each(["BUILT_UNIT", "PROJECT", "LAND"])("keeps agreement gating for project-linked %s", async (assetType) => {
    sale.assetType = assetType;
    sale.projectId = "qa-project";
    sale.atsDocumentUrl = null;
    await expect(completeSale({ saleId: sale.id, finalPaymentAmount: 0 })).rejects.toThrow("ATS or BBA");
    expect(tx.landParcel.update).not.toHaveBeenCalled();
  });

  it("rejects overpayment before changing asset or payment records", async () => {
    await expect(completeSale({ saleId: sale.id, finalPaymentAmount: 1700001 })).rejects.toThrow("exceeds remaining balance");
    expect(tx.assetSalePayment.create).not.toHaveBeenCalled();
    expect(tx.landParcel.update).not.toHaveBeenCalled();
  });
});
