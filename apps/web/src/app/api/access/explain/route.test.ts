import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson } from "@/test/mock-auth";
import { PERM } from "@/lib/roles";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

describe("GET /api/access/explain", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("explains the signed-in user's own access by the role that grants it", async () => {
    const res = await GET(makeRequest(`/api/access/explain?permission=${PERM.PO_APPROVE}`, { method: "GET" }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ global: boolean; via: { kind: string; role?: string }[] }>(res);
    expect(body.global).toBe(true);
    expect(body.via[0]).toMatchObject({ kind: "ROLE", role: "OWNER" });
  });

  it("refuses another member's access without users.view", async () => {
    setSessionUser({ role: "SECURITY_GUARD" });
    const res = await GET(
      makeRequest(`/api/access/explain?permission=${PERM.PO_APPROVE}&userId=someone-else`, { method: "GET" }),
      {},
    );
    expect(res.status).toBe(403);
  });
});
