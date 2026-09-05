import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("better-auth/crypto", () => ({ hashPassword: vi.fn().mockResolvedValue("hashed-pw-123") }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

describe("GET /api/auth/bootstrap", () => {
  beforeEach(() => {
    mockPrisma().user!.count.mockResolvedValue(0);
  });

  it("returns needsBootstrap: true when DB has zero users", async () => {
    mockPrisma().user!.count.mockResolvedValue(0);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await getJson<{ needsBootstrap: boolean }>(res);
    expect(body.needsBootstrap).toBe(true);
  });

  it("returns needsBootstrap: false when users already exist", async () => {
    mockPrisma().user!.count.mockResolvedValue(5);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await getJson<{ needsBootstrap: boolean }>(res);
    expect(body.needsBootstrap).toBe(false);
  });
});

describe("POST /api/auth/bootstrap", () => {
  beforeEach(() => {
    mockPrisma().user!.count.mockResolvedValue(0);
    mockPrisma().company!.create.mockResolvedValue({ id: "co-1", name: "Test Co" });
    mockPrisma().user!.create.mockResolvedValue({ id: "u-1", email: "owner@test.com", name: "Owner", role: "OWNER" });
    mockPrisma().userCompany!.create.mockResolvedValue({ id: "uc-1" });
    mockPrisma().account!.create.mockResolvedValue({ id: "acc-1" });
  });

  it("creates the first owner + company and returns 200", async () => {
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "Test Owner", ownerEmail: "owner@test.com", ownerPassword: "password123", companyName: "Test Co" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; company: { id: string }; user: { id: string; role: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.company.id).toBe("co-1");
    expect(body.user.role).toBe("OWNER");
  });

  it("returns 403 when users already exist", async () => {
    mockPrisma().user!.count.mockResolvedValue(3);
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "Test Owner", ownerEmail: "owner@test.com", ownerPassword: "password123", companyName: "Test Co" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when ownerName is too short", async () => {
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "A", ownerEmail: "owner@test.com", ownerPassword: "password123", companyName: "Test Co" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "Owner", ownerEmail: "not-an-email", ownerPassword: "password123", companyName: "Test Co" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "Owner", ownerEmail: "owner@test.com", ownerPassword: "short", companyName: "Test Co" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyName is too short", async () => {
    const res = await POST(
      makeRequest("/api/auth/bootstrap", {
        method: "POST",
        body: { ownerName: "Owner", ownerEmail: "owner@test.com", ownerPassword: "password123", companyName: "X" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
