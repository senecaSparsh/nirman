import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    approvePurchaseOrder: vi.fn().mockResolvedValue({}),
    rejectPurchaseOrder: vi.fn().mockResolvedValue({}),
    resubmitPurchaseOrder: vi.fn().mockResolvedValue({}),
    cancelPurchaseOrder: vi.fn().mockResolvedValue({}),
    shortClosePurchaseOrder: vi.fn().mockResolvedValue({ status: "CLOSED" }),
    orderPurchaseOrder: vi.fn().mockResolvedValue({}),
    updatePurchaseOrderEta: vi.fn().mockResolvedValue({ expectedDate: null }),
    addLineToPurchaseOrder: vi.fn().mockResolvedValue({ id: "line-1" }),
    canSelfApprovePurchaseOrder: vi.fn().mockReturnValue(true),
  };
});

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(body: unknown) {
  return makeRequest("/api/purchase-orders/po-1", { method: "PATCH", body });
}

describe("PATCH /api/purchase-orders/[id] validation", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockPrisma().purchaseOrder!.findFirst.mockResolvedValue({ id: "po-1", projectId: "p-1", createdById: "other-user" });
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.userId_companyId?.userId === "user-owner-1") {
        return { id: "m-owner", userId: "user-owner-1", companyId: "co-1", role: "OWNER", active: true, userPermissions: [] };
      }
      return null;
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([]);
  });

  it("rejects a non-string approvalNotes with 400, not a 500 or silent pass", async () => {
    const res = await PATCH(post({ action: "approve", approvalNotes: { x: 1 } }), makeCtx("po-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-string rejectionReason with 400", async () => {
    const res = await PATCH(post({ action: "reject", rejectionReason: 42 }), makeCtx("po-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean autoOrder with 400", async () => {
    const res = await PATCH(post({ action: "approve", autoOrder: "yes" }), makeCtx("po-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-string shortClose reason with 400", async () => {
    const res = await PATCH(post({ action: "shortClose", reason: [1, 2] }), makeCtx("po-1"));
    expect(res.status).toBe(400);
  });

  it("still rejects an unknown action with 400", async () => {
    const res = await PATCH(post({ action: "detonate" }), makeCtx("po-1"));
    expect(res.status).toBe(400);
  });
});
