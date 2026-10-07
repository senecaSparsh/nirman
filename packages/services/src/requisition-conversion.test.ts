import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@nirman/db";
import { convertRequisitionToPo } from "./requisition";
import { approvePurchaseOrder, createPurchaseOrderTx, orderPurchaseOrder } from "./procurement";
import { withSerializableTransaction } from "./transaction";
import { ServiceError } from "./errors";

vi.mock("./transaction", async importOriginal => ({
  ...await importOriginal<typeof import("./transaction")>(), withSerializableTransaction: vi.fn(),
}));
vi.mock("./procurement", async importOriginal => ({
  ...await importOriginal<typeof import("./procurement")>(),
  createPurchaseOrderTx: vi.fn(), approvePurchaseOrder: vi.fn(), orderPurchaseOrder: vi.fn(),
}));
vi.mock("./audit", () => ({ logAction: vi.fn() }));
vi.mock("./sequence", () => ({ nextSequenceNumber: vi.fn().mockResolvedValue("QA-PO"), companyScopedPrefix: vi.fn().mockResolvedValue("QA-") }));
vi.mock("./notification-event-bus", async importOriginal => ({
  ...await importOriginal<typeof import("./notification-event-bus")>(), emitNotificationEvent: vi.fn(),
}));

const draft = { id: "qa-po", poNumber: "QA-PO", companyId: "qa-company", status: "DRAFT" };
const req = {
  id: "qa-indent", reqNumber: "QA-INDENT", status: "APPROVED", projectId: "qa-project", convertedPoId: null,
  project: { companyId: "qa-company" }, department: null, requestedById: "qa-requester", submittedById: "qa-requester",
  minQuotesRequired: 3, quotesWaived: false, lines: [{ materialId: "qa-material", qtyRequested: new Decimal(1) }],
};
const tx = {
  materialRequisition: { findUnique: vi.fn(), update: vi.fn() },
  purchaseOrder: { update: vi.fn() },
};
const input = {
  requisitionId: req.id, supplierId: "qa-supplier", procurementScope: "PROJECT" as const,
  destinationLocationId: "qa-store", lineCosts: { "qa-material": 100 }, userId: "qa-approver",
  autoOrder: true, approverId: "qa-approver", approverRole: "PROJECT_DIRECTOR",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  tx.materialRequisition.findUnique.mockResolvedValue(req);
  vi.mocked(withSerializableTransaction).mockImplementation(async fn => fn(tx as unknown as Prisma.TransactionClient));
  vi.mocked(createPurchaseOrderTx).mockResolvedValue(draft as never);
  vi.mocked(orderPurchaseOrder).mockResolvedValue({ ...draft, status: "ORDERED" } as never);
  vi.mocked(approvePurchaseOrder).mockResolvedValue({ ...draft, status: "ORDERED" } as never);
  vi.spyOn(prisma.vendorQuote, "findFirst").mockResolvedValue({
    id: "qa-quote", submittedById: "qa-purchaser", status: "SELECTED",
    lines: [{ materialId: "qa-material", unitPrice: new Decimal(100), gstRate: new Decimal(0) }],
  } as never);
  vi.spyOn(prisma.vendorQuote, "groupBy").mockResolvedValue([{ status: "SELECTED", _count: 1 }] as never);
  vi.spyOn(prisma.vendorQuote, "findMany").mockResolvedValue([{ supplierId: "qa-supplier" }] as never);
  vi.spyOn(prisma.materialRequisition, "findUnique").mockResolvedValue(req as never);
});

describe("converted PO approval boundaries", () => {
  it("records the purchaser as creator and starts with an unapproved PO", async () => {
    await convertRequisitionToPo({ ...input, autoOrder: false });
    expect(createPurchaseOrderTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ createdById: "qa-purchaser" }));
    expect(vi.mocked(createPurchaseOrderTx).mock.calls[0]![1].initialStatus).not.toBe("APPROVED");
  });

  it("does not copy per-line freight into miscellaneous charges again", async () => {
    vi.mocked(prisma.vendorQuote.findFirst).mockResolvedValue({
      id: "qa-quote", submittedById: "qa-purchaser", status: "SELECTED",
      freightTotal: new Decimal(30), loadingTotal: new Decimal(6), packingTotal: new Decimal(5), insuranceTotal: new Decimal(2),
      handlingTotal: new Decimal(1), buyerTransportTotal: new Decimal(5),
      lines: [{ materialId: "qa-material", unitPrice: new Decimal(100), gstRate: new Decimal(18),
        freightPerUnit: new Decimal(30), loadingPerUnit: new Decimal(6), packingPerUnit: new Decimal(5), insurancePerUnit: new Decimal(2) }],
    } as never);
    await convertRequisitionToPo({ ...input, autoOrder: false });
    expect(vi.mocked(createPurchaseOrderTx).mock.calls[0]![1].charges).toEqual([
      { heading: "Handling Charges", amount: new Decimal(1) },
      { heading: "Transport — own arrangement (ex-works pickup)", amount: new Decimal(5) },
    ]);
  });

  it("matches PO header GST and total to discounted/packed line pricing", async () => {
    const actual = await vi.importActual<typeof import("./procurement")>("./procurement");
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "qa-po" }));
    const pricingTx = {
      stockLocation: { findFirst: vi.fn().mockResolvedValue({ type: "COMPANY_WAREHOUSE", companyId: "qa-company" }) },
      supplier: { findFirst: vi.fn().mockResolvedValue({ id: "qa-supplier" }) },
      material: { findMany: vi.fn().mockResolvedValue([{ id: "qa-material", name: "QA material", gstRate: new Decimal(18) }]) },
      rateContract: { findMany: vi.fn().mockResolvedValue([]) },
      purchaseOrder: { create },
    };
    const po = await actual.createPurchaseOrderTx(pricingTx as unknown as Prisma.TransactionClient, {
      companyId: "qa-company", supplierId: "qa-supplier", procurementScope: "COMPANY", destinationLocationId: "qa-store",
      lines: [{ materialId: "qa-material", qtyOrdered: 1, unitCost: 100, gstRate: 18, discountPerUnit: 10, packingPerUnit: 5, freightPerUnit: 30 }],
    });
    expect(po.gstTotal.toNumber()).toBe(17.1);
    expect(po.total.toNumber()).toBe(142.1);
  });

  it("uses normal PO approval for automatic ordering", async () => {
    const po = await convertRequisitionToPo(input);
    expect(approvePurchaseOrder).toHaveBeenCalledWith(draft.id, "PROJECT_DIRECTOR", "qa-approver", undefined, true);
    expect(po.status).toBe("ORDERED");
  });

  it.each(["You cannot approve your own PO", "This PO requires OWNER approval"])("leaves a draft when approval rejects: %s", async message => {
    vi.mocked(approvePurchaseOrder).mockRejectedValue(new ServiceError(message, 403));
    const po = await convertRequisitionToPo(input);
    expect(po.status).toBe("DRAFT");
    expect(orderPurchaseOrder).not.toHaveBeenCalled();
  });

  it("does not auto-order without explicit acting-role information", async () => {
    const po = await convertRequisitionToPo({ ...input, approverRole: undefined });
    expect(po.status).toBe("DRAFT");
    expect(approvePurchaseOrder).not.toHaveBeenCalled();
    expect(orderPurchaseOrder).not.toHaveBeenCalled();
  });
});
