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

describe("GET /api/portal/me", () => {
  beforeEach(() => {
    mockGetPortalCustomer.mockReset();
  });

  it("returns 401 when not logged in", async () => {
    mockGetPortalCustomer.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/portal/me"));
    expect(res.status).toBe(401);
  });

  it("returns the customer when authenticated", async () => {
    mockGetPortalCustomer.mockResolvedValue({
      id: "cust-1",
      name: "John Doe",
      phone: "+91 98765 43210",
      email: "john@test.com",
      companyId: "co-1",
      companyName: "Test Co",
    });
    const res = await GET(makeRequest("/api/portal/me"));
    expect(res.status).toBe(200);
    const body = await getJson<{ customer: { id: string; name: string } }>(res);
    expect(body.customer.id).toBe("cust-1");
    expect(body.customer.name).toBe("John Doe");
  });
});
