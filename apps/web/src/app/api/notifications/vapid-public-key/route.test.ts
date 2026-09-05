import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, getVapidPublicKey: vi.fn() };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

describe("GET /api/notifications/vapid-public-key", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("returns the public key when VAPID is configured", async () => {
    const { getVapidPublicKey } = await import("@nirman/services");
    (getVapidPublicKey as any).mockReturnValue("BPk_test_key_123");
    const res = await GET(makeRequest("/api/notifications/vapid-public-key"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ publicKey: string; configured: boolean }>(res);
    expect(body.publicKey).toBe("BPk_test_key_123");
    expect(body.configured).toBe(true);
  });

  it("returns 404 when VAPID is not configured", async () => {
    const { getVapidPublicKey } = await import("@nirman/services");
    (getVapidPublicKey as any).mockReturnValue(null);
    const res = await GET(makeRequest("/api/notifications/vapid-public-key"), {});
    expect(res.status).toBe(404);
    const body = await getJson<{ configured: boolean }>(res);
    expect(body.configured).toBe(false);
  });
});
