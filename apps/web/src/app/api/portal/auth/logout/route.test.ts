import { describe, it, expect, vi } from "vitest";
import { authMocks, makeRequest, getJson } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { POST } from "./route";

describe("POST /api/portal/auth/logout", () => {
  it("returns { ok: true } and deletes the portal cookie", async () => {
    const res = await POST(makeRequest("/api/portal/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("nirman-portal-customer");
  });
});
