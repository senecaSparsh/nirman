import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    listQuotationRequests: vi.fn().mockResolvedValue([]),
    getPendingApprovalsForManager: vi.fn().mockResolvedValue([]),
    createQuotationRequest: vi.fn().mockResolvedValue({ id: "qr-1", requestNumber: "QR-001", title: "Test", status: "OPEN", lines: [] }),
    seedHsnGstRates: vi.fn().mockResolvedValue({ created: 10 }),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST, PUT } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("GET /api/quotations", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with a list (default scope=all)", async () => {
    const { listQuotationRequests } = await import("@nirman/services");
    (listQuotationRequests as any).mockResolvedValue([
      { id: "qr-1", requestNumber: "QR-001", title: "Test", status: "OPEN", project: null, submittedBy: { name: "Jane" }, createdAt: new Date("2024-01-01"), lines: [], quotes: [], minQuotesRequired: 3, selectedQuoteId: null, convertedPo: null },
    ]);
    const res = await GET(makeRequest("/api/quotations"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/quotations"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks QUOTATION_VIEW", async () => {
    setSessionUser({ role: "HR_MANAGER" });
    const res = await GET(makeRequest("/api/quotations"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/quotations", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().userCompany!.findFirst.mockResolvedValue({ id: "uc-1", role: "OWNER", scopeType: null, reportsToUserCompanyId: null });
  });

  it("returns 400 for invalid input (missing title)", async () => {
    const res = await POST(
      makeRequest("/api/quotations", {
        method: "POST",
        body: { lines: [{ materialId: "m-1", qtyRequired: 10 }], destinationLocationId: "loc-1", requiredByDate: "2024-12-31" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("creates a quotation request and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/quotations", {
        method: "POST",
        body: {
          title: "Test RFQ",
          destinationLocationId: "loc-1",
          requiredByDate: "2024-12-31",
          minQuotesRequired: 3,
          lines: [{ materialId: "m-1", qtyRequired: 10 }],
        },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ id: string; requestNumber: string }>(res);
    expect(body.id).toBe("qr-1");
  });

  it("returns 403 when the user lacks QUOTATION_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/quotations", {
        method: "POST",
        body: { title: "Test", destinationLocationId: "loc-1", requiredByDate: "2024-12-31", lines: [{ materialId: "m-1", qtyRequired: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/quotations (seed HSN/GST)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("seeds HSN/GST rates and returns the count", async () => {
    const res = await PUT(makeRequest("/api/quotations", { method: "PUT" }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ seeded: number; message: string }>(res);
    expect(body.seeded).toBe(10);
  });

  it("returns 403 when the user lacks PROCUREMENT_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PUT(makeRequest("/api/quotations", { method: "PUT" }), {});
    expect(res.status).toBe(403);
  });
});
