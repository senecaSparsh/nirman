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

function prismaTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    title: "Fix bug",
    description: "Fix the login bug",
    instructions: null,
    status: "PENDING",
    priority: "medium",
    dueDate: new Date("2024-12-31"),
    completedAt: null,
    createdAt: new Date("2024-01-01"),
    assignedToId: "user-owner-1",
    assignedTo: { id: "user-owner-1" },
    ...overrides,
  };
}

function taskDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...prismaTask(),
    assignedTo: { id: "user-owner-1", name: "Test Owner", email: "owner@test.com", role: "OWNER", employees: [] },
    assignedBy: { id: "user-owner-1", name: "Test Owner" },
    subtasks: [],
    comments: [],
    activities: [],
    timeLogs: [],
    blocking: [],
    blockedBy: [],
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "task-1" }) };

describe("GET /api/tasks/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // First call: initial existence check. Second call: getTaskDetail re-fetch.
    mockPrisma().task!.findUnique
      .mockResolvedValueOnce(prismaTask())
      .mockResolvedValueOnce(taskDetail());
  });

  it("returns 200 with the task detail", async () => {
    const res = await GET(makeRequest("/api/tasks/task-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; title: string }>(res);
    expect(body.id).toBe("task-1");
    expect(body.title).toBe("Fix bug");
  });

  it("returns 404 when task not found", async () => {
    mockPrisma().task!.findUnique.mockReset().mockResolvedValue(null);
    const res = await GET(makeRequest("/api/tasks/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    mockPrisma().task!.findUnique.mockResolvedValue(prismaTask());
    const res = await GET(makeRequest("/api/tasks/task-1"), ctx);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findUnique.mockResolvedValue(prismaTask());
    mockPrisma().task!.update.mockResolvedValue(prismaTask({ status: "IN_PROGRESS" }));
  });

  it("returns 200 with updated status", async () => {
    const res = await PATCH(
      makeRequest("/api/tasks/task-1", { method: "PATCH", body: { status: "IN_PROGRESS" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; id: string; status: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on invalid status", async () => {
    const res = await PATCH(
      makeRequest("/api/tasks/task-1", { method: "PATCH", body: { status: "INVALID" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when task not found", async () => {
    mockPrisma().task!.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/tasks/missing", { method: "PATCH", body: { status: "IN_PROGRESS" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-assignee non-manager tries to update", async () => {
    setSessionUser(ACCOUNTANT);
    mockPrisma().task!.findUnique.mockResolvedValue(prismaTask({ assignedToId: "someone-else" }));
    const res = await PATCH(
      makeRequest("/api/tasks/task-1", { method: "PATCH", body: { title: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/tasks/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findUnique.mockResolvedValue(prismaTask());
    mockPrisma().task!.delete.mockResolvedValue(prismaTask());
  });

  it("returns 200 with ok:true on successful delete", async () => {
    const res = await DELETE(makeRequest("/api/tasks/task-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when task not found", async () => {
    mockPrisma().task!.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/tasks/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks TASKS_ASSIGN", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/tasks/task-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});
