import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { POST } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };

function post(body: unknown) {
  return makeRequest("/api/project-assignments", { method: "POST", body });
}

const CTX = { params: Promise.resolve({}) };

describe("POST /api/project-assignments", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockPrisma().project!.findFirst.mockResolvedValue({ id: "p-1", companyId: "co-1" });
    mockPrisma().userScope!.findFirst.mockResolvedValue(null);
    mockPrisma().projectAssignment!.upsert.mockResolvedValue({ id: "pa-1" });
    // Actor's own membership for scope checks.
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([]);
  });

  function mockTargetMembership(userId: string, active: boolean) {
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === OWNER.id) {
        return { id: "m-owner", userId: OWNER.id, companyId: "co-1", role: "OWNER", active: true, userPermissions: [] };
      }
      if (uid === userId) {
        return { id: `m-${userId}`, userId, companyId: "co-1", role: "SITE_ENGINEER", active, userPermissions: [], user: { id: userId } };
      }
      return null;
    });
  }

  it("rejects assigning a terminated (inactive) member to a project", async () => {
    mockTargetMembership("u-dead", false);
    const res = await POST(post({ userId: "u-dead", projectId: "p-1", scopedRole: "SITE_ENGINEER" }), CTX);
    expect(res.status).toBe(409);
  });

  it("accepts assigning an active member", async () => {
    mockTargetMembership("u-live", true);
    const res = await POST(post({ userId: "u-live", projectId: "p-1", scopedRole: "SITE_ENGINEER" }), CTX);
    expect(res.status).toBe(201);
  });
});
