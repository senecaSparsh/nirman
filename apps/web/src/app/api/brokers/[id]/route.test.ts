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

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

function prismaBroker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "brk-1",
    name: "John Doe",
    phone: "9876543210",
    agency: "Doe Realty",
    defaultCommissionPercent: 2.5,
    notes: "Top broker",
    companyId: "company-1",
    deletedAt: null,
    _count: { assetSales: 3 },
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "brk-1" }) };

describe("GET /api/brokers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().broker!.findFirst.mockResolvedValue(prismaBroker());
  });

  it("returns 200 with the broker", async () => {
    const res = await GET(makeRequest("/api/brokers/brk-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.id).toBe("brk-1");
    expect(body.name).toBe("John Doe");
  });

  it("returns 404 when broker not found", async () => {
    mockPrisma().broker!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/brokers/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks SALES_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/brokers/brk-1"), ctx);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/brokers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().broker!.findFirst.mockResolvedValue(prismaBroker());
    mockPrisma().broker!.update.mockResolvedValue(prismaBroker({ name: "Updated Broker" }));
  });

  it("returns 200 with the updated broker", async () => {
    const res = await PATCH(
      makeRequest("/api/brokers/brk-1", { method: "PATCH", body: { name: "Updated Broker" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; id: string; name: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("Updated Broker");
  });

  it("returns 400 on invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/brokers/brk-1", { method: "PATCH", body: { name: "" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks SALE_CREATE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/brokers/brk-1", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when broker not found", async () => {
    mockPrisma().broker!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/brokers/missing", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/brokers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().broker!.findFirst.mockResolvedValue(prismaBroker());
    mockPrisma().broker!.update.mockResolvedValue(prismaBroker({ deletedAt: new Date() }));
  });

  it("returns 200 with ok:true on successful soft delete", async () => {
    const res = await DELETE(makeRequest("/api/brokers/brk-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when broker not found", async () => {
    mockPrisma().broker!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/brokers/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks SALE_CREATE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/brokers/brk-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});
