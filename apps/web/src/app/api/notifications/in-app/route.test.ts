import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    getUserNotifications: vi.fn().mockResolvedValue([]),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH } from "./route";

const OWNER = { role: "OWNER" as const };

describe("GET /api/notifications/in-app", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 with notifications and unread count", async () => {
    const { getUserNotifications, getUnreadCount } = await import("@nirman/services");
    (getUserNotifications as any).mockResolvedValue([
      { id: "n1", eventType: "TEST", title: "Test", message: "Hello", link: null, isRead: false, readAt: null, createdAt: new Date("2024-01-01") },
    ]);
    (getUnreadCount as any).mockResolvedValue(1);
    const res = await GET(makeRequest("/api/notifications/in-app"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ notifications: unknown[]; unreadCount: number }>(res);
    expect(body.notifications).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/notifications/in-app"), {});
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/notifications/in-app", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("marks all notifications as read when markAll is true", async () => {
    const { markAllNotificationsRead } = await import("@nirman/services");
    const res = await PATCH(
      makeRequest("/api/notifications/in-app", { method: "PATCH", body: { markAll: true } }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(markAllNotificationsRead).toHaveBeenCalled();
  });

  it("marks a single notification as read when id is provided", async () => {
    const { markNotificationRead } = await import("@nirman/services");
    const res = await PATCH(
      makeRequest("/api/notifications/in-app", { method: "PATCH", body: { id: "n1" } }),
      {},
    );
    expect(res.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith("n1");
  });

  it("returns 400 when neither id nor markAll is provided", async () => {
    const res = await PATCH(
      makeRequest("/api/notifications/in-app", { method: "PATCH", body: {} }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/notifications/in-app", { method: "PATCH", body: { markAll: true } }),
      {},
    );
    expect(res.status).toBe(401);
  });
});
