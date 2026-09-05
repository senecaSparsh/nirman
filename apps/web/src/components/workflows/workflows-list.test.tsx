// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ canManageWorkflows: () => true }),
}));

import { WorkflowsList } from "./workflows-list";

const workflows = [
  { id: "w1", name: "Daily Backup", description: "Runs daily backup", icon: "Database", status: "ACTIVE", runCount: 30, nextRun: "2024-12-01", schedule: { intervalM: 1440 }, createdAt: "2024-01-01" },
  { id: "w2", name: "Weekly Report", description: null, icon: "FileText", status: "PAUSED", runCount: 4, nextRun: null, schedule: { cron: "0 9 * * 1" }, createdAt: "2024-02-01" },
];

describe("WorkflowsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders workflow names in the table", () => {
    render(<WorkflowsList workflows={workflows} />);
    expect(screen.getByText("Daily Backup")).toBeInTheDocument();
    expect(screen.getByText("Weekly Report")).toBeInTheDocument();
  });

  it("renders schedule labels", () => {
    render(<WorkflowsList workflows={workflows} />);
    expect(screen.getByText("every 1d")).toBeInTheDocument();
    expect(screen.getByText("cron: 0 9 * * 1")).toBeInTheDocument();
  });

  it("renders Create Workflow button when canEdit", () => {
    render(<WorkflowsList workflows={[]} />);
    expect(screen.getByText("Create Workflow")).toBeInTheDocument();
  });

  it("renders empty state when no workflows", () => {
    render(<WorkflowsList workflows={[]} />);
    expect(screen.getByText("No workflows yet")).toBeInTheDocument();
  });

  it("renders run count for each workflow", () => {
    render(<WorkflowsList workflows={workflows} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
