import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    submitGatePass: vi.fn().mockResolvedValue({}),
    approveGatePass: vi.fn().mockResolvedValue({}),
    rejectGatePass: vi.fn().mockResolvedValue({}),
    resubmitGatePass: vi.fn().mockResolvedValue({}),
    confirmExit: vi.fn().mockResolvedValue({}),
    cancelGatePass: vi.fn().mockResolvedValue({}),
    canAutoApprove: vi.fn().mockReturnValue(false),
  };
});

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(body: unknown) {
  return makeRequest("/api/gate-passes/gp-1", { method: "PATCH", body });
}

describe("PATCH /api/gate-passes/[id] validation", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockPrisma().gatePass!.findFirst.mockResolvedValue({ id: "gp-1", projectId: "p-1" });
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.userId_companyId?.userId === "user-owner-1") {
        return { id: "m-owner", userId: "user-owner-1", companyId: "co-1", role: "OWNER", active: true, userPermissions: [] };
      }
      return null;
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([]);
  });

  it("rejects a non-string reject reason with 400, not 500", async () => {
    const res = await PATCH(post({ action: "reject", reason: 42 }), makeCtx("gp-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-string notes field with 400", async () => {
    const res = await PATCH(post({ action: "approve", notes: { x: 1 } }), makeCtx("gp-1"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown action with 400", async () => {
    const res = await PATCH(post({ action: "detonate" }), makeCtx("gp-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a missing action with 400", async () => {
    const res = await PATCH(post({ notes: "hi" }), makeCtx("gp-1"));
    expect(res.status).toBe(400);
  });

  it("still requires a reason string for reject", async () => {
    const res = await PATCH(post({ action: "reject", reason: "   " }), makeCtx("gp-1"));
    expect(res.status).toBe(400);
  });
});
