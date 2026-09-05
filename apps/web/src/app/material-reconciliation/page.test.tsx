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

vi.mock("@/components/material-reconciliation/reconciliation-view", () => ({
  MaterialReconciliationView: (props: { projects: unknown[] }) => (
    <div data-testid="reconciliation-view">
      <span data-testid="projects-count">{props.projects.length}</span>
    </div>
  ),
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string; stats: Array<{ label: string; value: unknown }> }) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      {props.stats.map((s) => (
        <div key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
          {s.label}: {String(s.value)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { ReconContent } from "./page";

describe("MaterialReconciliationPage (ReconContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Material Reconciliation title", async () => {
    const ui = await ReconContent();
    render(ui);
    expect(screen.getByText("Material Reconciliation")).toBeInTheDocument();
  });

  it("renders the ReconciliationView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A" },
      { id: "p2", name: "Tower B" },
    ]);

    const ui = await ReconContent();
    render(ui);
    expect(screen.getByTestId("reconciliation-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("2");
  });

  it("shows NoAccess for a role without PROJECT_CONTROL_VIEW", async () => {
    setSessionUser({ role: "SALES_MANAGER" });
    const ui = await ReconContent();
    render(ui);
    expect(screen.queryByTestId("reconciliation-view")).not.toBeInTheDocument();
  });

  it("shows projects stat in the page header", async () => {
    const ui = await ReconContent();
    render(ui);
    expect(screen.getByTestId("stat-projects")).toBeInTheDocument();
  });
});
