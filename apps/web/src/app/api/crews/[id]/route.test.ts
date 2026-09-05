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
    updateCrew: vi.fn().mockResolvedValue({ id: "crew-1" }),
    deleteCrew: vi.fn().mockResolvedValue(undefined),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH, DELETE } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const PROCUREMENT_MANAGER = { role: "PROCUREMENT_MANAGER" as const };

function prismaCrewDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "crew-1",
    name: "A-Team",
    projectId: "proj-1",
    supervisorId: "sup-1",
    active: true,
    project: { id: "proj-1", name: "Green Valley" },
    supervisor: { id: "sup-1", name: "Ramesh" },
    members: [
      { id: "emp-1", name: "Worker 1", trade: "MASON", dailyRate: 500, wageType: "DAILY", active: true },
    ],
    ...overrides,
  };
}

describe("GET /api/crews/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().crew!.findFirst.mockResolvedValue(prismaCrewDetail());
  });

  it("returns 200 with crew detail", async () => {
    const res = await GET(makeRequest("/api/crews/crew-1"), { params: Promise.resolve({ id: "crew-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when crew not found", async () => {
    mockPrisma().crew!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/crews/crew-99"), { params: Promise.resolve({ id: "crew-99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks HR_VIEW", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await GET(makeRequest("/api/crews/crew-1"), { params: Promise.resolve({ id: "crew-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/crews/crew-1"), { params: Promise.resolve({ id: "crew-1" }) });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/crews/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 on successful update", async () => {
    const res = await PATCH(
      makeRequest("/api/crews/crew-1", { method: "PATCH", body: { name: "B-Team" } }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await PATCH(
      makeRequest("/api/crews/crew-1", { method: "PATCH", body: { name: "B-Team" } }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/crews/crew-1", { method: "PATCH", body: { name: "B-Team" } }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/crews/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 on successful deletion", async () => {
    const res = await DELETE(
      makeRequest("/api/crews/crew-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await DELETE(
      makeRequest("/api/crews/crew-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/crews/crew-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "crew-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns error status on service error", async () => {
    const { deleteCrew } = await import("@nirman/services");
    (deleteCrew as any).mockRejectedValue(new ServiceError("Crew not found", 404));
    const res = await DELETE(
      makeRequest("/api/crews/crew-99", { method: "DELETE" }),
      { params: Promise.resolve({ id: "crew-99" }) },
    );
    expect(res.status).toBe(404);
  });
});
