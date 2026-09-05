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

vi.mock("@nirman/services", () => ({
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/workflows/workflow-builder", () => ({
  WorkflowBuilder: (props: { workflowId: string; initialName: string }) => (
    <div data-testid="workflow-builder">
      <span data-testid="workflow-id">{props.workflowId}</span>
      <span data-testid="workflow-name">{props.initialName}</span>
    </div>
  ),
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string }) => (
    <div data-testid="page-header"><h1>{props.title}</h1></div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

vi.mock("@/components/no-access", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import { WorkflowLoader } from "./page";

describe("WorkflowEditorPage (WorkflowLoader)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders WorkflowBuilder with workflow data", async () => {
    mockPrisma().workflow!.findFirst.mockResolvedValue({
      id: "w1", name: "Daily Backup", description: "Backup workflow",
      status: "ACTIVE", graphJson: { nodes: [], edges: [] },
      schedules: [{ cron: "0 2 * * *", intervalM: 1440, enabled: true, nextRunAt: new Date("2024-06-02") }],
      runs: [],
    });

    const params = Promise.resolve({ id: "w1" });
    const ui = await WorkflowLoader({ params });
    render(ui);
    expect(screen.getByTestId("workflow-builder")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-name")).toHaveTextContent("Daily Backup");
  });

  it("shows not-found message when workflow does not exist", async () => {
    mockPrisma().workflow!.findFirst.mockResolvedValue(null);

    const params = Promise.resolve({ id: "nonexistent" });
    const ui = await WorkflowLoader({ params });
    render(ui);
    expect(screen.getByText("Workflow not found.")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-builder")).not.toBeInTheDocument();
  });

  it("shows NoAccess for a role without CANVAS_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const params = Promise.resolve({ id: "w1" });
    const ui = await WorkflowLoader({ params });
    render(ui);
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-builder")).not.toBeInTheDocument();
  });
});
