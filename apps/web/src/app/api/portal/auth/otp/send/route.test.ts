import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});

import { POST } from "./route";

describe("POST /api/portal/auth/otp/send", () => {
  beforeEach(() => {
    mockPrisma().phoneOtp!.count.mockResolvedValue(0);
    mockPrisma().customer!.findMany.mockResolvedValue([]);
    mockPrisma().phoneOtp!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().phoneOtp!.create.mockResolvedValue({ id: "otp-1" });
  });

  it("returns 400 when phone is missing", async () => {
    const res = await POST(makeRequest("/api/portal/auth/otp/send", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/phone/i);
  });

  it("returns 400 for an invalid (too short) phone number", async () => {
    const res = await POST(
      makeRequest("/api/portal/auth/otp/send", { method: "POST", body: { phone: "123" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns { ok: true } even when no customer matches (anti-enumeration)", async () => {
    mockPrisma().customer!.findMany.mockResolvedValue([]);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/send", { method: "POST", body: { phone: "9876543210" } }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(mockPrisma().phoneOtp!.create).toHaveBeenCalled();
  });

  it("returns { ok: true } when a customer matches and stores the OTP", async () => {
    mockPrisma().customer!.findMany.mockResolvedValue([
      { id: "cust-1", name: "John", companyId: "co-1", phone: "+91 98765 43210" },
    ]);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/send", { method: "POST", body: { phone: "9876543210" } }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(mockPrisma().phoneOtp!.create).toHaveBeenCalled();
  });

  it("returns 429 when too many OTPs have been requested in the window", async () => {
    mockPrisma().phoneOtp!.count.mockResolvedValue(3);
    const res = await POST(
      makeRequest("/api/portal/auth/otp/send", { method: "POST", body: { phone: "9876543210" } }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/portal/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
