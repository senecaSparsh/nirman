import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    lowStockAlerts: vi.fn().mockResolvedValue([]),
    getCompanyPortfolioSummary: vi.fn().mockResolvedValue({}),
    trialBalance: vi.fn().mockResolvedValue([]),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const decimal = (value: string) => ({ toString: () => value });

function po(poNumber: string, total: string) {
  return {
    id: poNumber,
    poNumber,
    projectId: "p1",
    total: decimal(total),
    createdAt: new Date("2026-03-01T00:00:00Z"),
    supplier: { name: "Supplier" },
    _count: { lines: 2 },
  };
}

function ask(text: string) {
  return POST(makeRequest("/api/assistant", { method: "POST", body: { text } }), {});
}

describe("assistant approval answers follow the approver's own authority", () => {
  beforeEach(() => {
    setSessionUser({ role: "PROJECT_MANAGER" });
    Object.assign(mockPrisma().company!, {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ poApprovalThresholdManager: null, poApprovalThresholdAdmin: null }),
    });
    mockPrisma().purchaseOrder!.findMany.mockResolvedValue([po("PO-SMALL", "10000"), po("PO-LARGE", "600000")]);
  });

  it("the approvals list shows only the POs a project manager can approve", async () => {
    const body = await getJson<{ text: string }>(await ask("approvals pending"));
    expect(body.text).toContain("PO-SMALL");
    expect(body.text).not.toContain("PO-LARGE");
  });

  it("attention counts only the POs a project manager can approve", async () => {
    const body = await getJson<{ text: string }>(await ask("attention"));
    expect(body.text).toContain("1 PO approve karne pending");
  });

  it("the dashboard counts only the POs a project manager can approve", async () => {
    const body = await getJson<{ text: string }>(await ask("dashboard"));
    expect(body.text).toContain("Approvals: 1 POs");
  });
});
