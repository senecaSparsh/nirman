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

  it("updates phone and syncs phoneNormalized", async () => {
    const res = await PATCH(
      makeRequest("/api/me/profile", { method: "PATCH", body: { phone: "+91 98765 43210" } }),
      {},
    );
    expect(res.status).toBe(200);
    const updateCall = mockPrisma().user!.update.mock.calls[0];
    expect(updateCall![0].data.phoneNormalized).toBe("919876543210");
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
