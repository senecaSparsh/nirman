// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { TaskDetailDrawer } from "./task-detail-drawer";

const taskDetail = {
  id: "t1",
  title: "Fix the plumbing issue",
  description: "Leak in bathroom 2",
  instructions: null,
  status: "PENDING",
  priority: "high",
  dueDate: "2024-12-01",
  estimateMins: 120,
  completedAt: null,
  createdAt: "2024-11-01T00:00:00Z",
  assignedTo: { id: "u1", name: "Ramesh Kumar", email: "ramesh@test.com", role: "WORKER", employeeId: "e1" },
  assignedBy: { id: "u2", name: "Admin" },
  subtasks: [
    { id: "s1", title: "Buy pipes", completed: true, order: 0, completedAt: "2024-11-02", completedBy: { name: "Ramesh" } },
    { id: "s2", title: "Fix the leak", completed: false, order: 1, completedAt: null, completedBy: null },
  ],
  comments: [],
  activities: [{ id: "a1", kind: "CREATED", message: "Task created", createdAt: "2024-11-01", user: { id: "u2", name: "Admin" } }],
  timeLogs: [],
  blockedBy: [],
  blocking: [],
};

describe("TaskDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => taskDetail,
    });
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <TaskDetailDrawer taskId="t1" open={false} onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when taskId is null", () => {
    const { container } = render(
      <TaskDetailDrawer taskId={null} open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders task title after loading", async () => {
    render(
      <TaskDetailDrawer taskId="t1" open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Fix the plumbing issue")).toBeInTheDocument();
    });
  });

  it("renders status and priority badges", async () => {
    render(
      <TaskDetailDrawer taskId="t1" open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByText("high")).toBeInTheDocument();
    });
  });

  it("renders Start button for pending task when canEdit", async () => {
    render(
      <TaskDetailDrawer taskId="t1" open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start/ })).toBeInTheDocument();
    });
  });

  it("renders tab buttons with counts", async () => {
    render(
      <TaskDetailDrawer taskId="t1" open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Steps")).toBeInTheDocument();
      expect(screen.getByText("Discussion")).toBeInTheDocument();
      expect(screen.getByText("Activity")).toBeInTheDocument();
      expect(screen.getByText("Links")).toBeInTheDocument();
      expect(screen.getByText("Time")).toBeInTheDocument();
    });
  });

  it("renders assignee name", async () => {
    render(
      <TaskDetailDrawer taskId="t1" open onClose={vi.fn()} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Ramesh Kumar")).toBeInTheDocument();
    });
  });

  it("closes on Escape key", async () => {
    const onClose = vi.fn();
    render(
      <TaskDetailDrawer taskId="t1" open onClose={onClose} users={[]} canManage currentUserId="u1" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Fix the plumbing issue")).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
