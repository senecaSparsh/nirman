import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST as switchDesktop } from "./route";
import { POST as switchMobile } from "../../company/switch/route";

const OWNER = { role: "OWNER" as const };
const ADMIN = { role: "ADMIN" as const };
const ENGINEER = { role: "SITE_ENGINEER" as const };

const PARENT = { id: "co-parent", name: "SRG Group", parentCompanyId: null };
const SUB = { id: "co-sub", name: "SRG Subsidiary", parentCompanyId: "co-parent" };

/**
 * Simulate the membership check baked into the query: the company resolves
 * only when the caller holds an active membership there. MEMBERSHIPS lists
 * which companies this test's user belongs to.
 */
let MEMBERSHIPS: Set<string> = new Set();
function wireCompanyLookup() {
  mockPrisma().company!.findFirst.mockImplementation(async (args?: {
    where?: { id?: string; userMemberships?: unknown };
  }) => {
    const id = args?.where?.id;
    const target = [PARENT, SUB].find((c) => c.id === id) ?? null;
    if (!target) return null;
    // When the route adds the membership filter, honor it.
    if (args?.where?.userMemberships && !MEMBERSHIPS.has(id!)) return null;
    return target;
  });
}

function body(companyId: string) {
  return { companyId };
}

describe("POST /api/companies/switch (desktop)", () => {
  beforeEach(() => {
    MEMBERSHIPS = new Set([PARENT.id, SUB.id]);
    wireCompanyLookup();
  });

  it("OWNER at parent → subsidiary (member): allowed", async () => {
    setSessionUser(OWNER);
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(SUB.id) }), {});
    expect(res.status).toBe(200);
  });

  it("OWNER inside subsidiary → back to parent: allowed (no stranded trap)", async () => {
    setSessionUser(OWNER);
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(PARENT.id) }), {});
    expect(res.status).toBe(200);
  });

  it("ADMIN (tier-1) can switch like an owner", async () => {
    setSessionUser(ADMIN);
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(SUB.id) }), {});
    expect(res.status).toBe(200);
  });

  it("SITE_ENGINEER with memberships in both companies → 403", async () => {
    setSessionUser(ENGINEER);
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(SUB.id) }), {});
    expect(res.status).toBe(403);
    const d = await getJson<{ error: string }>(res);
    expect(d.error).toMatch(/owners and admins/i);
  });

  it("OWNER → company where they hold NO membership → 404", async () => {
    setSessionUser(OWNER);
    MEMBERSHIPS = new Set([PARENT.id]); // not a member of SUB
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(SUB.id) }), {});
    expect(res.status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    clearSession();
    const res = await switchDesktop(makeRequest("/api/companies/switch", { method: "POST", body: body(SUB.id) }), {});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/company/switch (mobile) — identical policy", () => {
  beforeEach(() => {
    MEMBERSHIPS = new Set([PARENT.id, SUB.id]);
    wireCompanyLookup();
  });

  it("OWNER at parent → subsidiary (member): allowed", async () => {
    setSessionUser(OWNER);
    const res = await switchMobile(makeRequest("/api/company/switch", { method: "POST", body: body(SUB.id) }));
    expect(res.status).toBe(200);
  });

  it("OWNER inside subsidiary → back to parent: allowed (no stranded trap)", async () => {
    setSessionUser(OWNER);
    const res = await switchMobile(makeRequest("/api/company/switch", { method: "POST", body: body(PARENT.id) }));
    expect(res.status).toBe(200);
  });

  it("SITE_ENGINEER with memberships in both companies → 403 (accidental grants stay unreachable)", async () => {
    setSessionUser(ENGINEER);
    const res = await switchMobile(makeRequest("/api/company/switch", { method: "POST", body: body(SUB.id) }));
    expect(res.status).toBe(403);
  });

  it("OWNER → non-member company → 403", async () => {
    setSessionUser(OWNER);
    MEMBERSHIPS = new Set([PARENT.id]);
    const res = await switchMobile(makeRequest("/api/company/switch", { method: "POST", body: body(SUB.id) }));
    expect(res.status).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    clearSession();
    const res = await switchMobile(makeRequest("/api/company/switch", { method: "POST", body: body(SUB.id) }));
    expect(res.status).toBe(401);
  });
});
