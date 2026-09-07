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
    addDependency: vi.fn().mockResolvedValue(undefined),
    removeDependency: vi.fn().mockResolvedValue(undefined),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const SUPERVISOR = { role: "SUPERVISOR" as const };

describe("POST /api/tasks/[id]/dependencies", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // verifyTaskInCompany checks both tasks via task.findFirst
    mockPrisma().task!.findFirst.mockResolvedValue({ id: "task-1" });
  });

  it("returns 201 on successful dependency creation", async () => {
    const res = await POST(
      makeRequest("/api/tasks/task-1/dependencies", { method: "POST", body: { blockerId: "task-2" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on missing blockerId", async () => {
    const res = await POST(
      makeRequest("/api/tasks/task-1/dependencies", { method: "POST", body: {} }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a manager", async () => {
    setSessionUser(SUPERVISOR);
    const res = await POST(
      makeRequest("/api/tasks/task-1/dependencies", { method: "POST", body: { blockerId: "task-2" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/tasks/task-1/dependencies", { method: "POST", body: { blockerId: "task-2" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/tasks/[id]/dependencies", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findFirst.mockResolvedValue({ id: "task-1" });
  });

  it("returns 200 on successful dependency removal", async () => {
    const res = await DELETE(
      makeRequest("/api/tasks/task-1/dependencies?blockerId=task-2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 when blockerId query param is missing", async () => {
    const res = await DELETE(
      makeRequest("/api/tasks/task-1/dependencies", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a manager", async () => {
    setSessionUser(SUPERVISOR);
    const res = await DELETE(
      makeRequest("/api/tasks/task-1/dependencies?blockerId=task-2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/tasks/task-1/dependencies?blockerId=task-2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(401);
  });
});
