// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/render";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

// Mock the MyTasksHub client component — renders props as JSON for assertions
vi.mock("@/components/tasks/my-tasks-hub", () => ({
  MyTasksHub: (props: { teamTasks: unknown[]; users: unknown[]; canAssign: boolean; canManage: boolean; currentUserId: string; canViewTeam: boolean }) => (
    <div data-testid="my-tasks-hub">
      <span data-testid="tasks-count">{props.teamTasks.length}</span>
      <span data-testid="users-count">{props.users.length}</span>
      <span data-testid="can-assign">{String(props.canAssign)}</span>
      <span data-testid="can-view-team">{String(props.canViewTeam)}</span>
      <span data-testid="current-user-id">{props.currentUserId}</span>
      <span data-testid="team-tasks-json">{JSON.stringify(props.teamTasks)}</span>
    </div>
  ),
}));

// Mock PageHeader and PageLoading
vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string }) => (
    <div data-testid="page-header"><h1>{props.title}</h1></div>
  ),
}));
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { MyTasksContent } from "./content";

describe("MyTasksPage (MyTasksContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().task!.findMany.mockResolvedValue([]);
    mockPrisma().user!.findMany.mockResolvedValue([]);
  });

  it("renders the MyTasksHub component", async () => {
    const ui = await MyTasksContent();
    render(ui);
    expect(screen.getByTestId("my-tasks-hub")).toBeInTheDocument();
  });

  it("renders the MyTasksHub with fetched data", async () => {
    mockPrisma().task!.findMany.mockResolvedValue([
      {
        id: "t1", title: "Pour foundation", description: "Pour concrete", instructions: null,
        status: "IN_PROGRESS", priority: "HIGH", dueDate: new Date("2024-12-01"),
        createdAt: new Date("2024-11-01"), completedAt: null,
        assignedTo: { id: "u1", name: "Alice", email: "alice@test.com", role: "SITE_ENGINEER", employees: [{ id: "emp-1" }] },
        assignedBy: { id: "u2", name: "Bob" },
      },
    ]);
    mockPrisma().user!.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@test.com", role: "SITE_ENGINEER" },
    ]);

    const ui = await MyTasksContent();
    render(ui);

    expect(screen.getByTestId("my-tasks-hub")).toBeInTheDocument();
    expect(screen.getByTestId("tasks-count")).toHaveTextContent("1");
    expect(screen.getByTestId("users-count")).toHaveTextContent("1");
  });

  it("passes canAssign=true for OWNER role (has TASKS_ASSIGN)", async () => {
    const ui = await MyTasksContent();
    render(ui);
    expect(screen.getByTestId("can-assign")).toHaveTextContent("true");
    expect(screen.getByTestId("can-view-team")).toHaveTextContent("true");
  });

  it("passes canAssign=false for SITE_ENGINEER role (lacks TASKS_ASSIGN)", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await MyTasksContent();
    render(ui);
    expect(screen.getByTestId("can-assign")).toHaveTextContent("false");
    expect(screen.getByTestId("can-view-team")).toHaveTextContent("false");
  });

  it("maps task data correctly — formats dates and extracts employeeId", async () => {
    const dueDate = new Date("2024-12-01T10:00:00Z");
    const createdAt = new Date("2024-11-01T08:00:00Z");
    mockPrisma().task!.findMany.mockResolvedValue([
      {
        id: "t1", title: "Task 1", description: "Desc", instructions: "Step 1",
        status: "TODO", priority: "MEDIUM", dueDate, createdAt, completedAt: null,
        assignedTo: { id: "u1", name: "Alice", email: "a@t.com", role: "SITE_ENGINEER", employees: [{ id: "emp-1" }] },
        assignedBy: { id: "u2", name: "Bob" },
      },
    ]);
    mockPrisma().user!.findMany.mockResolvedValue([]);

    const ui = await MyTasksContent();
    render(ui);

    const tasks = JSON.parse(screen.getByTestId("team-tasks-json").textContent!);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("t1");
    expect(tasks[0].title).toBe("Task 1");
    expect(tasks[0].dueDateRaw).toBe(dueDate.toISOString());
    expect(tasks[0].assignedTo.employeeId).toBe("emp-1");
    expect(tasks[0].assignedBy.name).toBe("Bob");
  });

  it("renders empty state when no tasks exist", async () => {
    const ui = await MyTasksContent();
    render(ui);
    expect(screen.getByTestId("tasks-count")).toHaveTextContent("0");
    expect(screen.getByTestId("users-count")).toHaveTextContent("0");
  });
});
