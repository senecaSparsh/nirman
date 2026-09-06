import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    getComparativeMatrix: vi.fn().mockResolvedValue({ request: { id: "qr-1", title: "Test" }, matrix: [] }),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const HR_MANAGER = { role: "HR_MANAGER" as const };

describe("GET /api/quotations/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findMany.mockResolvedValue([]);
    mockPrisma().quotationRequest!.findFirst.mockResolvedValue({
      id: "qr-1",
      status: "OPEN",
      submittedByUserCompanyId: "uc-1",
    });
    mockPrisma().userCompany!.findUnique.mockResolvedValue({ reportsToUserCompanyId: null, userId: "user-owner-1", userPermissions: [] });
    mockPrisma().supplier!.findMany.mockResolvedValue([
      { id: "sup-1", name: "Supplier A", phone: "123", gstin: "GST123" },
    ]);
  });

  it("returns the comparative matrix with suppliers", async () => {
    const res = await GET(makeRequest("/api/quotations/qr-1"), { params: Promise.resolve({ id: "qr-1" }) });
    expect(res.status).toBe(200);
    const body = await getJson<{ request: { id: string }; canApprove: boolean; canAddQuote: boolean; suppliers: unknown[] }>(res);
    expect(body.request.id).toBe("qr-1");
    expect(body.suppliers).toHaveLength(1);
  });

  it("returns 404 when quotation request is not found", async () => {
    mockPrisma().quotationRequest!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/quotations/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/quotations/qr-1"), { params: Promise.resolve({ id: "qr-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks QUOTATION_VIEW", async () => {
    setSessionUser(HR_MANAGER);
    const res = await GET(makeRequest("/api/quotations/qr-1"), { params: Promise.resolve({ id: "qr-1" }) });
    expect(res.status).toBe(403);
  });
});
