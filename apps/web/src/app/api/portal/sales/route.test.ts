import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const { mockGetPortalCustomer } = vi.hoisted(() => ({ mockGetPortalCustomer: vi.fn() }));
vi.mock("@/lib/portal-auth", async () => {
  const actual = await vi.importActual("@/lib/portal-auth");
  return { ...actual, getPortalCustomer: mockGetPortalCustomer };
});

import { GET } from "./route";

const CUSTOMER = { id: "cust-1", name: "John", phone: "123", email: null, companyId: "co-1", companyName: "Co" };

function prismaSale(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sale-1",
    saleNumber: "SAL-001",
    saleDate: new Date("2024-03-01"),
    saleStage: "BOOKED",
    assetType: "BUILT_UNIT",
    salePrice: 5000000,
    gstAmount: 900000,
    atsDocumentUrl: null,
    bbaDocumentUrl: null,
    registryDocumentUrl: null,
    allotmentDocumentUrl: null,
    draftDocumentUrl: null,
    allotmentLetterNo: null,
    bbaNo: null,
    saleDeedNo: null,
    atsNo: null,
    project: { id: "proj-1", name: "Tower A" },
    landParcel: null,
    builtUnit: { id: "bu-1", unitNumber: "A-101", unitType: "2BHK", area: 1200, areaUnit: "sqft", floor: 1, wing: "A" },
    payments: [{ id: "pmt-1", amount: 2000000, paymentDate: new Date("2024-03-15"), mode: "BANK_TRANSFER", reference: "TXN123", status: "CLEARED" }],
    paymentSchedule: null,
    ...overrides,
  };
}

describe("GET /api/portal/sales", () => {
  beforeEach(() => {
    mockGetPortalCustomer.mockReset();
    mockGetPortalCustomer.mockResolvedValue(CUSTOMER);
    mockPrisma().assetSale!.findMany.mockResolvedValue([]);
  });

  it("returns 401 when not logged in", async () => {
    mockGetPortalCustomer.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/portal/sales"));
    expect(res.status).toBe(401);
  });

  it("returns empty sales list when customer has no active sales", async () => {
    const res = await GET(makeRequest("/api/portal/sales"));
    expect(res.status).toBe(200);
    const body = await getJson<{ sales: unknown[] }>(res);
    expect(body.sales).toHaveLength(0);
  });

  it("returns sales with computed payment progress", async () => {
    mockPrisma().assetSale!.findMany.mockResolvedValue([prismaSale()]);
    const res = await GET(makeRequest("/api/portal/sales"));
    expect(res.status).toBe(200);
    const body = await getJson<{ sales: Array<{ id: string; totalAmount: number; totalPaid: number; balanceDue: number; paymentProgress: number; unitLabel: string }> }>(res);
    expect(body.sales).toHaveLength(1);
    const sale = body.sales[0]!;
    // totalAmount = salePrice(5M) + gstAmount(900K) = 5,900,000
    expect(sale.totalAmount).toBe(5900000);
    // totalPaid = 2,000,000
    expect(sale.totalPaid).toBe(2000000);
    // balanceDue = 5,900,000 - 2,000,000 = 3,900,000
    expect(sale.balanceDue).toBe(3900000);
    // paymentProgress = round(2M / 5.9M * 100) = 34
    expect(sale.paymentProgress).toBe(34);
    expect(sale.unitLabel).toContain("A-101");
  });

  it("handles LAND asset type with parcel label", async () => {
    mockPrisma().assetSale!.findMany.mockResolvedValue([
      prismaSale({
        assetType: "LAND",
        builtUnit: null,
        landParcel: { id: "lp-1", number: "Plot 5", area: 5000, areaUnit: "sqft" },
      }),
    ]);
    const res = await GET(makeRequest("/api/portal/sales"));
    const body = await getJson<{ sales: Array<{ unitLabel: string }> }>(res);
    expect(body.sales[0]!.unitLabel).toContain("Plot 5");
  });
});
