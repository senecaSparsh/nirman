import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const decimal = (value: string) => ({ toString: () => value });

function poRow(id: string, total: string) {
  return {
    id,
    poNumber: `PO-${id}`,
    supplier: { id: "sup-1", name: "Supplier" },
    project: { id: "p1", name: "Tower A", totalBudget: null },
    procurementScope: "PROJECT",
    status: "DRAFT",
    total: decimal(total),
    subtotal: decimal(total),
    gstTotal: decimal("0"),
    lines: [],
    createdBy: { id: "u2", name: "Asha" },
    createdAt: new Date("2026-03-01T00:00:00Z"),
    expectedDate: null,
    projectId: "p1",
  };
}

describe("GET /api/approvals", () => {
  beforeEach(() => {
    Object.assign(mockPrisma().company!, {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ poApprovalThresholdManager: null, poApprovalThresholdAdmin: null }),
    });
    mockPrisma().purchaseOrder!.findMany.mockResolvedValue([poRow("small", "10000"), poRow("large", "600000")]);
  });

  it("badge count includes only the POs a project manager can approve", async () => {
    setSessionUser({ role: "PROJECT_MANAGER" });
    const res = await GET(makeRequest("/api/approvals?countOnly=1", { method: "GET" }), {});
    expect(await getJson<{ count: number }>(res)).toEqual({ count: 1 });
  });

  it("badge count includes every PO for the owner, who clears every value tier", async () => {
    setSessionUser({ role: "OWNER" });
    const res = await GET(makeRequest("/api/approvals?countOnly=1", { method: "GET" }), {});
    expect(await getJson<{ count: number }>(res)).toEqual({ count: 2 });
  });

  it("badge count is zero for a role with no approval permission", async () => {
    setSessionUser({ role: "SECURITY_GUARD" });
    const res = await GET(makeRequest("/api/approvals?countOnly=1", { method: "GET" }), {});
    expect(await getJson<{ count: number }>(res)).toEqual({ count: 0 });
  });

  it("flags each listed PO by whether this approver can approve it", async () => {
    setSessionUser({ role: "PROJECT_MANAGER" });
    const res = await GET(makeRequest("/api/approvals", { method: "GET" }), {});
    const body = await getJson<{ purchaseOrders: { id: string; canApprove: boolean }[] }>(res);
    expect(body.purchaseOrders.map((p) => [p.id, p.canApprove])).toEqual([
      ["small", true],
      ["large", false],
    ]);
  });
});
