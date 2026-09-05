import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    createCrew: vi.fn().mockResolvedValue({ id: "crew-1" }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const PROCUREMENT_MANAGER = { role: "PROCUREMENT_MANAGER" as const };

function prismaCrew(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "crew-1",
    name: "A-Team",
    projectId: "proj-1",
    supervisorId: "sup-1",
    active: true,
    project: { id: "proj-1", name: "Green Valley" },
    supervisor: { id: "sup-1", name: "Ramesh" },
    _count: { members: 5 },
    ...overrides,
  };
}

describe("GET /api/crews", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().crew!.findMany.mockResolvedValue([prismaCrew()]);
  });

  it("returns 200 with mapped crew rows", async () => {
    const res = await GET(makeRequest("/api/crews"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/crews"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks HR_VIEW", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await GET(makeRequest("/api/crews"), {});
    expect(res.status).toBe(403);
  });

  it("supports projectId filter", async () => {
    const res = await GET(makeRequest("/api/crews?projectId=proj-1"), {});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/crews", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 400 on invalid input (missing name)", async () => {
    const res = await POST(
      makeRequest("/api/crews", { method: "POST", body: { memberIds: [] } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await POST(
      makeRequest("/api/crews", { method: "POST", body: { name: "A-Team" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/crews", { method: "POST", body: { name: "A-Team" } }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("creates a crew and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/crews", { method: "POST", body: { name: "A-Team", memberIds: ["emp-1"] } }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("crew-1");
  });
});
