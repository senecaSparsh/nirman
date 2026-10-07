import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import type { Prisma } from "@nirman/db";
import { executeMaterialIssue } from "./issue";
import { recordMovement, withStockTransaction } from "./stock-ledger";

vi.mock("./stock-ledger", async importOriginal => ({
  ...await importOriginal<typeof import("./stock-ledger")>(),
  withStockTransaction: vi.fn(),
  recordMovement: vi.fn(),
}));
vi.mock("./valuation", () => ({ reallocateProjectCosts: vi.fn() }));
vi.mock("./audit", () => ({ logAction: vi.fn() }));
vi.mock("./gate-pass", () => ({ assertGatePassApproved: vi.fn().mockResolvedValue(undefined), autoCreateGatePassFromRef: vi.fn() }));
vi.mock("./gl-posting", async importOriginal => ({
  ...await importOriginal<typeof import("./gl-posting")>(),
  postMaterialIssue: vi.fn(),
}));

const tx = { materialIssue: { findUnique: vi.fn(), update: vi.fn() } };
const pending = {
  id: "qa-issue", status: "PENDING", projectId: "qa-project", project: { companyId: "qa-company" },
  fromLocationId: "qa-store", issuedById: null, roundOff: new Decimal(0),
  lines: [{ id: "qa-line", materialId: "qa-cement", qty: new Decimal(2), lotNumber: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.materialIssue.findUnique.mockResolvedValue(pending);
  tx.materialIssue.update.mockImplementation(async ({ data }) => ({ ...pending, ...data }));
  vi.mocked(recordMovement).mockResolvedValue({ newMAC: new Decimal("367.01") } as never);
  vi.mocked(withStockTransaction).mockImplementation(async fn => fn(tx as unknown as Prisma.TransactionClient));
});

describe("gate-pass material issue execution", () => {
  it.each([0, 0.98, -0.02])("sets document total from actual cost plus round-off %s", async roundOff => {
    tx.materialIssue.findUnique.mockResolvedValue({ ...pending, roundOff: new Decimal(roundOff) });
    await executeMaterialIssue(pending.id);
    expect(tx.materialIssue.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalCost: new Decimal("734.02"), totalAmount: new Decimal("734.02").plus(roundOff) }),
    }));
    expect(recordMovement).toHaveBeenCalledOnce();
  });

  it("does not deduct stock twice when an issue is already completed", async () => {
    tx.materialIssue.findUnique.mockResolvedValue({ ...pending, status: "COMPLETED" });
    await expect(executeMaterialIssue(pending.id)).rejects.toThrow("Cannot execute issue");
    expect(recordMovement).not.toHaveBeenCalled();
  });
});
