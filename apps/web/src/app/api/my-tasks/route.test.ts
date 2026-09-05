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

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };

function prismaTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    title: "Build wall",
    description: "Build the east wall",
    instructions: null,
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: new Date("2024-02-01"),
    completedAt: null,
    createdAt: new Date("2024-01-15"),
    estimateMins: 480,
    assignedBy: { id: "user-2", name: "Manager" },
    subtasks: [{ id: "sub-1", title: "Mix cement", completed: false }],
    timeLogs: [{ durationMins: 120 }],
    _count: { comments: 2 },
    ...overrides,
  };
}

describe("GET /api/my-tasks", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findMany.mockResolvedValue([prismaTask()]);
  });

  it("returns 200 with mapped tasks", async () => {
    const res = await GET(makeRequest("/api/my-tasks"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/my-tasks"), {});
    expect(res.status).toBe(401);
  });

  it("supports status filter", async () => {
    const res = await GET(makeRequest("/api/my-tasks?status=IN_PROGRESS"), {});
    expect(res.status).toBe(200);
  });

  it("computes subtaskProgress from subtasks", async () => {
    mockPrisma().task!.findMany.mockResolvedValue([
      prismaTask({ subtasks: [
        { id: "sub-1", title: "A", completed: true },
        { id: "sub-2", title: "B", completed: false },
      ] }),
    ]);
    const res = await GET(makeRequest("/api/my-tasks"), {});
    expect(res.status).toBe(200);
    const body = await getJson<Array<{ subtaskProgress: number | null }>>(res);
    expect(body[0]!.subtaskProgress).toBe(50);
  });

  it("returns null subtaskProgress when no subtasks", async () => {
    mockPrisma().task!.findMany.mockResolvedValue([prismaTask({ subtasks: [] })]);
    const res = await GET(makeRequest("/api/my-tasks"), {});
    expect(res.status).toBe(200);
    const body = await getJson<Array<{ subtaskProgress: number | null }>>(res);
    expect(body[0]!.subtaskProgress).toBe(null);
  });
});
