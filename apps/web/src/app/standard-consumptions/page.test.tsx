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

vi.mock("@/components/standard-consumptions/standard-consumptions-view", () => ({
  StandardConsumptionsView: (props: { benchmarks: unknown[]; permissions: { canManage: boolean } }) => (
    <div data-testid="standard-consumptions-view">
      <span data-testid="benchmarks-count">{props.benchmarks.length}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
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

import { StandardConsumptionsContent } from "./page";

describe("StandardConsumptionsPage (StandardConsumptionsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Consumption Benchmarks title", async () => {
    const ui = await StandardConsumptionsContent();
    render(ui);
    expect(screen.getByText("Consumption Benchmarks")).toBeInTheDocument();
  });

  it("renders the StandardConsumptionsView with fetched benchmarks", async () => {
    mockPrisma().standardConsumption!.findMany.mockResolvedValue([
      {
        id: "sc1", workType: "FOUNDATION", materialId: "m1",
        material: { code: "STL-001", name: "Steel TMT", unit: "KG" },
        standardQty: 1.5, baseQty: 100, unitOfMeasure: "SQFT", notes: "1.5kg per 100sqft",
      },
    ]);

    const ui = await StandardConsumptionsContent();
    render(ui);
    expect(screen.getByTestId("standard-consumptions-view")).toBeInTheDocument();
    expect(screen.getByTestId("benchmarks-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without INVENTORY_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await StandardConsumptionsContent();
    render(ui);
    expect(screen.queryByTestId("standard-consumptions-view")).not.toBeInTheDocument();
  });

  it("passes canManage=true for OWNER role", async () => {
    const ui = await StandardConsumptionsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
  });

  it("shows benchmarks and work-types stats", async () => {
    const ui = await StandardConsumptionsContent();
    render(ui);
    expect(screen.getByTestId("stat-benchmarks")).toBeInTheDocument();
    expect(screen.getByTestId("stat-work-types")).toBeInTheDocument();
  });
});
