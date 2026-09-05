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

vi.mock("@/components/measurement-book/mb-view", () => ({
  MeasurementBookView: (props: { projects: unknown[]; canCreate: boolean }) => (
    <div data-testid="mb-view">
      <span data-testid="projects-count">{props.projects.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
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

import { MbContent } from "./page";

describe("MeasurementBookPage (MbContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Measurement Book title", async () => {
    const ui = await MbContent();
    render(ui);
    expect(screen.getByText("Measurement Book")).toBeInTheDocument();
  });

  it("renders the MeasurementBookView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A", type: "RESIDENTIAL", status: "ACTIVE" },
    ]);

    const ui = await MbContent();
    render(ui);
    expect(screen.getByTestId("mb-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without MB_VIEW", async () => {
    setSessionUser({ role: "SALES_MANAGER" });
    const ui = await MbContent();
    render(ui);
    expect(screen.queryByTestId("mb-view")).not.toBeInTheDocument();
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await MbContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });
});
