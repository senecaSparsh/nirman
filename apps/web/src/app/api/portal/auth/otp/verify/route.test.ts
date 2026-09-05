import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

function prismaOtp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "otp-1",
    phone: "9876543210",
    code: "123456",
    usedAt: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    ...overrides,
  };
}

function prismaCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cust-1",
    name: "John Doe",
    phone: "+91 98765 43210",
    email: "john@test.com",
    companyId: "co-1",
    company: { name: "Test Co" },
    _count: { assetSales: 2 },
    ...overrides,
  };
}

describe("POST /api/portal/auth/otp/verify", () => {
  beforeEach(() => {
    mockPrisma().phoneOtp!.findFirst.mockResolvedValue(prismaOtp());
    mockPrisma().phoneOtp!.update.mockResolvedValue(prismaOtp());
    mockPrisma().customer!.findMany.mockResolvedValue([prismaCustomer()]);
  });

  it("returns 400 when phone or code is missing", async () => {
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", { method: "POST", body: { phone: "9876543210" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid OTP is found", async () => {
    mockPrisma().phoneOtp!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "123456" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it("returns 429 when max attempts exceeded", async () => {
    mockPrisma().phoneOtp!.findFirst.mockResolvedValue(prismaOtp({ attempts: 5 }));
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "123456" },
      }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 with remaining attempts on wrong code", async () => {
    mockPrisma().phoneOtp!.findFirst.mockResolvedValue(prismaOtp({ attempts: 1 }));
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "999999" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/incorrect code/i);
  });

  it("logs in a single customer and sets the portal cookie", async () => {
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "123456" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ requiresSelection: boolean; customer: { id: string; name: string } }>(res);
    expect(body.requiresSelection).toBe(false);
    expect(body.customer.id).toBe("cust-1");
    // Cookie should be set
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("nirman-portal-customer");
  });

  it("returns requiresSelection when multiple customers match", async () => {
    mockPrisma().customer!.findMany.mockResolvedValue([
      prismaCustomer({ id: "cust-1", name: "John" }),
      prismaCustomer({ id: "cust-2", name: "John", company: { name: "Other Co" } }),
    ]);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "123456" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ requiresSelection: boolean; customers: unknown[] }>(res);
    expect(body.requiresSelection).toBe(true);
    expect(body.customers).toHaveLength(2);
  });

  it("returns 404 when no customer is found after OTP verification", async () => {
    mockPrisma().customer!.findMany.mockResolvedValue([]);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/verify", {
        method: "POST",
        body: { phone: "9876543210", code: "123456" },
      }),
    );
    expect(res.status).toBe(404);
  });
});
