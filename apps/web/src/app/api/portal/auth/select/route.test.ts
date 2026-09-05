import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

describe("POST /api/portal/auth/select", () => {
  beforeEach(() => {
    mockPrisma().customer!.findUnique.mockResolvedValue({
      id: "cust-1",
      name: "John Doe",
      company: { name: "Test Co" },
    });
  });

  it("returns 400 when customerId is missing", async () => {
    const res = await POST(makeRequest("/api/portal/auth/select", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when customer is not found", async () => {
    mockPrisma().customer!.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/portal/auth/select", { method: "POST", body: { customerId: "nope" } }),
    );
    expect(res.status).toBe(404);
  });

  it("selects a customer and sets the portal cookie", async () => {
    const res = await POST(
      makeRequest("/api/portal/auth/select", { method: "POST", body: { customerId: "cust-1" } }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ customer: { id: string; name: string; companyName: string } }>(res);
    expect(body.customer.id).toBe("cust-1");
    expect(body.customer.name).toBe("John Doe");
    expect(body.customer.companyName).toBe("Test Co");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("nirman-portal-customer");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/portal/auth/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
