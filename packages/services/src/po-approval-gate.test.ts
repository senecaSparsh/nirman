/**
 * Purchase-order approval gate.
 *
 *  - A PO at or above the company's admin threshold needs the OWNER. ADMIN
 *    must not pass that tier.
 *  - Nobody approves a PO they created. That includes ADMIN; only the OWNER
 *    may approve their own PO.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { approvePurchaseOrder } from "./procurement";
import { withSerializableTransaction } from "./transaction";

vi.mock("@nirman/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nirman/db")>()),
  prisma: {
    company: {
      findUnique: vi.fn().mockResolvedValue({
        poApprovalThresholdManager: null,
        poApprovalThresholdAdmin: null,
        currency: "INR",
      }),
    },
  },
}));
vi.mock("./transaction", () => ({ withSerializableTransaction: vi.fn() }));
vi.mock("./audit", () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./notification-event-bus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./notification-event-bus")>()),
  emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

function givenPurchaseOrder(overrides: { total: string; createdById?: string }) {
  const po = {
    id: "po-1",
    poNumber: "PO-1",
    status: "DRAFT",
    companyId: "c1",
    createdById: overrides.createdById ?? "u-creator",
    total: overrides.total,
  };
  const tx = {
    purchaseOrder: {
      findUnique: vi.fn().mockResolvedValue(po),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...po,
        ...data,
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  vi.mocked(withSerializableTransaction).mockImplementation(
    async (fn: (tx: never) => Promise<unknown>) => fn(tx as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("purchase order approval gate", () => {
  it("an ADMIN cannot approve a PO at or above the owner threshold", async () => {
    givenPurchaseOrder({ total: "600000" });
    await expect(approvePurchaseOrder("po-1", "ADMIN", "u-admin")).rejects.toThrow(/requires OWNER approval/);
  });

  it("the OWNER can approve a PO at or above the owner threshold", async () => {
    givenPurchaseOrder({ total: "600000" });
    await expect(approvePurchaseOrder("po-1", "OWNER", "u-owner")).resolves.toBeDefined();
  });

  it("an ADMIN cannot approve a PO they created", async () => {
    givenPurchaseOrder({ total: "100000", createdById: "u-admin" });
    await expect(approvePurchaseOrder("po-1", "ADMIN", "u-admin")).rejects.toThrow(
      /cannot approve a purchase order you created/,
    );
  });

  it("the OWNER can approve a PO they created", async () => {
    givenPurchaseOrder({ total: "100000", createdById: "u-owner" });
    await expect(approvePurchaseOrder("po-1", "OWNER", "u-owner")).resolves.toBeDefined();
  });

  it("a project manager can approve a PO under the manager threshold", async () => {
    givenPurchaseOrder({ total: "20000" });
    await expect(approvePurchaseOrder("po-1", "PROJECT_MANAGER", "u-pm")).resolves.toBeDefined();
  });

  it("a project manager cannot approve a PO above the manager threshold", async () => {
    givenPurchaseOrder({ total: "100000" });
    await expect(approvePurchaseOrder("po-1", "PROJECT_MANAGER", "u-pm")).rejects.toThrow(/requires ADMIN approval/);
  });
});
