import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";
import { PERM } from "@/lib/roles";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

describe("GET /api/access/who-can", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("refuses a user without users.view", async () => {
    setSessionUser({ role: "SECURITY_GUARD" });
    const res = await GET(makeRequest(`/api/access/who-can?permission=${PERM.PO_APPROVE}`, { method: "GET" }), {});
    expect(res.status).toBe(403);
  });

  it("rejects an unknown permission", async () => {
    const res = await GET(makeRequest("/api/access/who-can?permission=made.up", { method: "GET" }), {});
    expect(res.status).toBe(400);
  });

  it("lists the members who hold the permission, with the source that grants it", async () => {
    mockPrisma().userCompany!.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.approvalsDelegatedToId) return [];
      return [
        {
          id: "uc-pm",
          userId: "user-pm",
          role: "PROJECT_MANAGER",
          activeRole: null,
          secondaryRoles: [],
          userPermissions: [],
          user: { name: "Asha", email: "asha@test.com" },
        },
      ];
    });
    const res = await GET(makeRequest(`/api/access/who-can?permission=${PERM.PO_APPROVE}`, { method: "GET" }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ holders: { userId: string; global: boolean; via: { kind: string; role?: string }[] }[] }>(res);
    expect(body.holders.map((h) => h.userId)).toEqual(["user-pm"]);
    expect(body.holders[0]!.global).toBe(true);
    expect(body.holders[0]!.via[0]).toMatchObject({ kind: "ROLE", role: "PROJECT_MANAGER" });
  });
});
