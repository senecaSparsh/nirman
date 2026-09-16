import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, createInAppNotification: vi.fn().mockResolvedValue(undefined), logAction: vi.fn().mockResolvedValue(undefined) };
});

import { GET, PUT, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const MANAGER = { role: "PROJECT_MANAGER" as const };
const EMPTY_CTX = {} as never;

const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

/** myMembership: userCompany.findUnique({ where: { userId_companyId } }) */
function setMine(m: Record<string, unknown> | null) {
  mockPrisma().userCompany!.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    if (args.where.userId_companyId) {
      return m ?? {
        id: "uc-me",
        role: "PROJECT_MANAGER",
        approvalsDelegatedToId: null,
        delegationStartedAt: null,
        delegationEndsAt: null,
        delegationNote: null,
        approvalsDelegatedTo: null,
      };
    }
    if (args.where.id === "uc-me") {
      return { userId: "user-1", companyId: "company-1" };
    }
    return null;
  });
}

describe("PUT /api/delegation", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setMine(null);
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().userCompany!.update.mockResolvedValue({});
  });

  it("rejects missing fields", async () => {
    const res = await PUT(makeRequest("/api/delegation", { method: "PUT", body: {} }), EMPTY_CTX);
    expect(res.status).toBe(400);
  });

  it("rejects a past end date", async () => {
    const res = await PUT(makeRequest("/api/delegation", {
      method: "PUT",
      body: { delegateMembershipId: "uc-bob", endsAt: new Date(Date.now() - 86_400_000).toISOString() },
    }), EMPTY_CTX);
    expect(res.status).toBe(400);
  });

  it("rejects a delegate outside the company", async () => {
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    const res = await PUT(makeRequest("/api/delegation", {
      method: "PUT",
      body: { delegateMembershipId: "uc-outsider", endsAt: future() },
    }), EMPTY_CTX);
    expect(res.status).toBe(400);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/not an active member/i);
  });

  it("rejects delegating to yourself", async () => {
    mockPrisma().userCompany!.findFirst.mockResolvedValue({ id: "uc-me-2", userId: "user-1" });
    const res = await PUT(makeRequest("/api/delegation", {
      method: "PUT",
      body: { delegateMembershipId: "uc-me-2", endsAt: future() },
    }), EMPTY_CTX);
    expect(res.status).toBe(400);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/yourself/i);
  });

  it("rejects a two-way delegation loop", async () => {
    // delegate (uc-bob, userId bob) already delegates back to me
    mockPrisma().userCompany!.findFirst
      .mockResolvedValueOnce({ id: "uc-bob", userId: "bob" })   // delegate validation
      .mockResolvedValueOnce({ id: "uc-bob-back" });             // cycle check
    const res = await PUT(makeRequest("/api/delegation", {
      method: "PUT",
      body: { delegateMembershipId: "uc-bob", endsAt: future() },
    }), EMPTY_CTX);
    expect(res.status).toBe(400);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/loop/i);
  });

  it("delegates my authority on the happy path", async () => {
    mockPrisma().userCompany!.findFirst
      .mockResolvedValueOnce({ id: "uc-bob", userId: "bob" })
      .mockResolvedValueOnce(null);
    const res = await PUT(makeRequest("/api/delegation", {
      method: "PUT",
      body: { delegateMembershipId: "uc-bob", endsAt: future(), note: "On site" },
    }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const upd = mockPrisma().userCompany!.update.mock.calls.at(-1)![0];
    expect(upd.where.id).toBe("uc-me");
    expect(upd.data.approvalsDelegatedToId).toBe("uc-bob");
    expect(upd.data.delegationNote).toBe("On site");
    expect(upd.data.delegationEndsAt).toBeInstanceOf(Date);
  });
});

describe("GET /api/delegation", () => {
  it("returns my delegation state + members", async () => {
    setSessionUser(MANAGER);
    setMine({
      id: "uc-me",
      role: "PROJECT_MANAGER",
      approvalsDelegatedToId: "uc-bob",
      delegationStartedAt: new Date(),
      delegationEndsAt: new Date(Date.now() + 86_400_000),
      delegationNote: "Travelling",
      approvalsDelegatedTo: { user: { id: "bob", name: "Bob", email: "b@x.com" } },
    });
    const res = await GET(makeRequest("/api/delegation"), EMPTY_CTX);
    expect(res.status).toBe(200);
    const d = await getJson<{
      mine: { delegateName: string | null } | null;
      incoming: unknown[];
      members: unknown[];
      isAdmin: boolean;
    }>(res);
    expect(d.mine?.delegateName).toBe("Bob");
    expect(d.isAdmin).toBe(false);
  });
});

describe("DELETE /api/delegation", () => {
  it("clears my delegation", async () => {
    setSessionUser(OWNER);
    setMine(null);
    const res = await DELETE(makeRequest("/api/delegation", { method: "DELETE" }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const upd = mockPrisma().userCompany!.update.mock.calls.at(-1)![0];
    expect(upd.where.id).toBe("uc-me");
    expect(upd.data.approvalsDelegatedToId).toBeNull();
    expect(upd.data.delegationEndsAt).toBeNull();
  });
});
