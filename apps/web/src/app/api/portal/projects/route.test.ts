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

describe("GET /api/portal/projects", () => {
  beforeEach(() => {
    mockGetPortalCustomer.mockReset();
    mockGetPortalCustomer.mockResolvedValue(CUSTOMER);
    mockPrisma().assetSale!.findMany.mockResolvedValue([]);
    mockPrisma().project!.findMany.mockResolvedValue([]);
    mockPrisma().dailyProgressReport!.findMany.mockResolvedValue([]);
  });

  it("returns 401 when not logged in", async () => {
    mockGetPortalCustomer.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/portal/projects"));
    expect(res.status).toBe(401);
  });

  it("returns empty projects when customer has no active sales", async () => {
    mockPrisma().assetSale!.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest("/api/portal/projects"));
    expect(res.status).toBe(200);
    const body = await getJson<{ projects: unknown[] }>(res);
    expect(body.projects).toHaveLength(0);
  });

  it("returns projects with DPR-based progress updates", async () => {
    mockPrisma().assetSale!.findMany.mockResolvedValue([{ projectId: "proj-1" }]);
    mockPrisma().project!.findMany.mockResolvedValue([
      {
        id: "proj-1",
        name: "Tower A",
        status: "ACTIVE",
        startDate: new Date("2024-01-01"),
        endDate: null,
        address: "123 Main St",
        _count: { builtUnits: 50 },
      },
    ]);
    mockPrisma().dailyProgressReport!.findMany.mockResolvedValue([
      {
        id: "dpr-1",
        date: new Date("2024-06-15"),
        workSummary: "Foundation work",
        progressPct: 35,
        photoUrls: ["http://img1.jpg"],
        projectId: "proj-1",
      },
    ]);
    const res = await GET(makeRequest("/api/portal/projects"));
    expect(res.status).toBe(200);
    const body = await getJson<{ projects: Array<{ id: string; name: string; progressPct: number; latestUpdates: unknown[] }> }>(res);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]!.id).toBe("proj-1");
    expect(body.projects[0]!.progressPct).toBe(35);
    expect(body.projects[0]!.latestUpdates).toHaveLength(1);
  });
});
