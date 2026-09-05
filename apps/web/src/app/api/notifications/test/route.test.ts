import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    sendNotification: vi.fn().mockResolvedValue({ id: "log-1", status: "SENT", errorMessage: null }),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const SUPERVISOR = { role: "SUPERVISOR" as const };

describe("POST /api/notifications/test", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("sends a test notification and returns the log entry", async () => {
    const res = await POST(
      makeRequest("/api/notifications/test", {
        method: "POST",
        body: { channel: "WHATSAPP", recipient: "9876543210", message: "Test msg" },
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; status: string; error: string | null }>(res);
    expect(body.id).toBe("log-1");
    expect(body.status).toBe("SENT");
  });

  it("returns 500 for invalid channel (zod parse throws)", async () => {
    const res = await POST(
      makeRequest("/api/notifications/test", {
        method: "POST",
        body: { channel: "INVALID", recipient: "9876543210" },
      }),
      {},
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when recipient is missing (zod parse throws)", async () => {
    const res = await POST(
      makeRequest("/api/notifications/test", {
        method: "POST",
        body: { channel: "EMAIL" },
      }),
      {},
    );
    expect(res.status).toBe(500);
  });

  it("returns 403 when the user lacks FINANCE_MANAGE", async () => {
    setSessionUser(SUPERVISOR);
    const res = await POST(
      makeRequest("/api/notifications/test", {
        method: "POST",
        body: { channel: "IN_APP", recipient: "user-1" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/notifications/test", {
        method: "POST",
        body: { channel: "IN_APP", recipient: "user-1" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});
