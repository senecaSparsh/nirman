import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };

describe("POST /api/notifications/subscribe", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().pushSubscription!.findUnique.mockClear();
    mockPrisma().pushSubscription!.create.mockClear();
    mockPrisma().pushSubscription!.update.mockClear();
    mockPrisma().pushSubscription!.findUnique.mockResolvedValue(null);
    mockPrisma().pushSubscription!.create.mockResolvedValue({ id: "sub-1", endpoint: "https://fcm.example/abc" });
    mockPrisma().pushSubscription!.update.mockResolvedValue({ id: "sub-1", endpoint: "https://fcm.example/abc" });
  });

  it("returns 400 when endpoint is missing", async () => {
    const res = await POST(
      makeRequest("/api/notifications/subscribe", { method: "POST", body: {} }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("creates a new subscription and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/notifications/subscribe", {
        method: "POST",
        body: { endpoint: "https://fcm.example/abc", keys: { p256dh: "key1", auth: "auth1" } },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ id: string; endpoint: string }>(res);
    expect(body.id).toBe("sub-1");
    expect(mockPrisma().pushSubscription!.create).toHaveBeenCalled();
  });

  it("updates an existing subscription instead of creating a new one", async () => {
    mockPrisma().pushSubscription!.findUnique.mockResolvedValue({
      id: "sub-existing",
      endpoint: "https://fcm.example/abc",
      userId: "user-owner-1",
    });
    const res = await POST(
      makeRequest("/api/notifications/subscribe", {
        method: "POST",
        body: { endpoint: "https://fcm.example/abc" },
      }),
      {},
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().pushSubscription!.update).toHaveBeenCalled();
    expect(mockPrisma().pushSubscription!.create).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/notifications/subscribe", {
        method: "POST",
        body: { endpoint: "https://fcm.example/abc" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/notifications/subscribe", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().pushSubscription!.findUnique.mockResolvedValue({
      id: "sub-1",
      endpoint: "https://fcm.example/abc",
      userId: "user-owner-1",
    });
    mockPrisma().pushSubscription!.update.mockResolvedValue({ id: "sub-1" });
  });

  it("returns 400 when endpoint is missing", async () => {
    const res = await DELETE(
      makeRequest("/api/notifications/subscribe", { method: "DELETE", body: {} }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("deactivates the subscription and returns { deleted: true }", async () => {
    const res = await DELETE(
      makeRequest("/api/notifications/subscribe", {
        method: "DELETE",
        body: { endpoint: "https://fcm.example/abc" },
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ deleted: boolean }>(res);
    expect(body.deleted).toBe(true);
    expect(mockPrisma().pushSubscription!.update).toHaveBeenCalled();
  });

  it("returns 404 when subscription does not exist", async () => {
    mockPrisma().pushSubscription!.findUnique.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("/api/notifications/subscribe", {
        method: "DELETE",
        body: { endpoint: "https://fcm.example/xyz" },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when subscription belongs to a different user", async () => {
    mockPrisma().pushSubscription!.findUnique.mockResolvedValue({
      id: "sub-1",
      endpoint: "https://fcm.example/abc",
      userId: "different-user",
    });
    const res = await DELETE(
      makeRequest("/api/notifications/subscribe", {
        method: "DELETE",
        body: { endpoint: "https://fcm.example/abc" },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });
});
