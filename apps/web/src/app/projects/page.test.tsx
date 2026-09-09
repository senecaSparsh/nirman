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
  projectPnl: vi.fn(async () => ({ total: 100000, revenue: 150000, profit: 50000, margin: 33.33 })),
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/projects/projects-view", () => ({
  ProjectsView: (props: { projects: unknown[]; permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean } }) => (
    <div data-testid="projects-view">
      <span data-testid="projects-count">{props.projects.length}</span>
      <span data-testid="can-create">{String(props.permissions?.canCreate ?? false)}</span>
      <span data-testid="can-edit">{String(props.permissions?.canEdit ?? false)}</span>
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

import { ProjectsContent } from "./content";

describe("ProjectsPage (ProjectsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Projects title", async () => {
    const ui = await ProjectsContent();
    render(ui);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("renders the ProjectsView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      {
        id: "p1", name: "Tower A", type: "RESIDENTIAL", status: "ACTIVE", address: "123 Main St",
        startDate: new Date("2024-01-01"), endDate: null, reraNumber: null,
        reraRegistrationDate: null, reraValidityDate: null, reraWebsiteUrl: null,
        totalBudget: 1000000, totalProjectCost: 500000,
        builtUnits: [{ status: "AVAILABLE", saleId: null }],
        _count: { stockLocations: 2, phases: 1 },
      },
    ]);

    const ui = await ProjectsContent();
    render(ui);
    expect(screen.getByTestId("projects-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("1");
  });

  it("shows stats for total, active, completed, on hold", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "A", type: "RESIDENTIAL", status: "ACTIVE", builtUnits: [], _count: { stockLocations: 0, phases: 0 } },
      { id: "p2", name: "B", type: "COMMERCIAL", status: "COMPLETED", builtUnits: [], _count: { stockLocations: 0, phases: 0 } },
      { id: "p3", name: "C", type: "LAND", status: "ON_HOLD", builtUnits: [], _count: { stockLocations: 0, phases: 0 } },
    ]);

    const ui = await ProjectsContent();
    render(ui);
    expect(screen.getByTestId("stat-total")).toHaveTextContent("Total: 3");
    expect(screen.getByTestId("stat-active")).toHaveTextContent("Active: 1");
    expect(screen.getByTestId("stat-completed")).toHaveTextContent("Completed: 1");
    expect(screen.getByTestId("stat-on-hold")).toHaveTextContent("On hold: 1");
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await ProjectsContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
    expect(screen.getByTestId("can-edit")).toHaveTextContent("true");
  });

  it("passes canCreate=false for SITE_ENGINEER role", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await ProjectsContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("false");
  });
});
