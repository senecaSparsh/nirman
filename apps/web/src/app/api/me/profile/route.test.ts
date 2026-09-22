import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const };

describe("PATCH /api/me/profile", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().user!.update.mockClear();
    mockPrisma().user!.update.mockResolvedValue({
      id: "user-owner-1",
      name: "Updated Name",
      email: "owner@test.com",
      phone: "9876543210",
      image: null,
    });
  });

  it("updates the user's name and returns the updated profile", async () => {
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: { name: "Updated Name" } }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.name).toBe("Updated Name");
    expect(mockPrisma().user!.update).toHaveBeenCalled();
  });

  it("rejects self-service phone changes — phone is the OTP login identity", async () => {
    // A self-set phoneNormalized (typo, recycled pool number, or someone
    // else's) corrupts the multi-user OTP lookup: the real holder of that
    // number could pick this account at sign-in. Phone changes must go
    // through the verified Change-Phone flow.
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: { phone: "+91 98765 43210" } }),
      {},
    );
    expect(res.status).toBe(400);
    expect(mockPrisma().user!.update).not.toHaveBeenCalled();
  });

  it("returns 400 when no fields are provided", async () => {
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: {} }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: { name: "" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: { name: "X" } }),
      {},
    );
    expect(res.status).toBe(401);
  });
});
