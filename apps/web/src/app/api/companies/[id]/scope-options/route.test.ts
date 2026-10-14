import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, logAction: vi.fn().mockResolvedValue(undefined) };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "co-1" }) };

describe("GET /api/companies/[id]/scope-options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionUser({ role: "OWNER" });
    setCompany({ id: "co-1" });
    mockPrisma().project!.findMany.mockResolvedValue([{ id: "p-1", name: "Tower A" }]);
    mockPrisma().department!.findMany.mockResolvedValue([{ id: "d-1", code: "BOIL", name: "Boiler House" }]);
  });

  it("lists the company's live projects and active departments for the add-member picker", async () => {
    const res = await GET(makeRequest("/api/companies/co-1/scope-options"), ctx);
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      projects: [{ id: "p-1", name: "Tower A" }],
      departments: [{ id: "d-1", code: "BOIL", name: "Boiler House" }],
    });
  });

  it("only reads live projects and active departments of this company", async () => {
    await GET(makeRequest("/api/companies/co-1/scope-options"), ctx);
    expect(mockPrisma().project!.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: "co-1", deletedAt: null }) }),
    );
    expect(mockPrisma().department!.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: "co-1", active: true, deletedAt: null }) }),
    );
  });

  it("is limited to people who can manage companies", async () => {
    setSessionUser({ role: "SALES_MANAGER" });
    const res = await GET(makeRequest("/api/companies/co-1/scope-options"), ctx);
    expect(res.status).toBe(403);
  });
});
