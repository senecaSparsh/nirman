// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import {
  authMocks,
  setSessionUser,
  mockPrisma,
} from "@/test/mock-auth";

// Top-level mocks — hoisted by vitest.
vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
// next/server connection() is a no-op (already mocked in setup, but be explicit).
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

// Mock the MaterialsView client component — we want to test the *page*
// (data fetching + transformation + permission gating), not the view's
// internal interactions. The mock renders the props so we can assert the
// right data flowed through.
vi.mock("@/components/materials/materials-view", () => ({
  MaterialsView: (props: { materials: unknown[]; categories: unknown[]; lowStock: unknown[]; permissions: unknown }) => (
    <div data-testid="materials-view">
      <span data-testid="materials-count">{props.materials.length}</span>
      <span data-testid="categories-count">{props.categories.length}</span>
      <span data-testid="low-stock-count">{props.lowStock.length}</span>
      <span data-testid="can-create">{String((props.permissions as { canCreate?: boolean })?.canCreate ?? false)}</span>
    </div>
  ),
}));

// Mock PageHeader to keep the render tree simple.
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

// Mock PageLoading (used in Suspense fallback).
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

// Import AFTER mocks are registered.
// We test MaterialsContent directly (not through the page wrapper) because
// the page wraps it in <Suspense> which doesn't resolve in jsdom for async
// server components. MaterialsContent is the async function that does the
// data fetching + transformation + permission gating — calling it directly
// and rendering its returned element tests the full logic.
import { MaterialsContent } from "./page";

describe("MaterialsPage (MaterialsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    // Default: empty results
    mockPrisma().materialCategory!.findMany.mockResolvedValue([]);
    mockPrisma().material!.findMany.mockResolvedValue([]);
    mockPrisma().supplier!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Materials title", async () => {
    const ui = await MaterialsContent();
    render(ui);
    expect(screen.getByText("Materials")).toBeInTheDocument();
  });

  it("renders the MaterialsView with the fetched data", async () => {
    // Set up mock data
    mockPrisma().materialCategory!.findMany.mockResolvedValue([
      { id: "cat-1", name: "Steel", unit: "KG", class: "RAW_MATERIAL", _count: { materials: 2 } },
    ]);
    mockPrisma().material!.findMany
      .mockResolvedValueOnce([
        {
          id: "m1", code: "STL-001", name: "Steel TMT", grade: "Fe500D", specification: null,
          categoryId: "cat-1", unit: "KG", hsnCode: "7213", gstRate: 18, standardCost: 75,
          minStock: 100, reorderPoint: null, economicOrderQty: null, volumetricDensity: null,
          bulkDiscountPct: null, isCorporateCommodity: false, isLotTracked: false, isScrap: false,
          baseUnit: "KG", secondaryUnit: null, uomConversionFactor: null, description: null,
          category: { id: "cat-1", name: "Steel", unit: "KG" },
          stockItems: [{ qty: 50, movingAvgCost: 70 }],
        },
      ])
      .mockResolvedValueOnce([]); // lowStock query (second findMany call)

    const ui = await MaterialsContent();
    render(ui);

    expect(screen.getByTestId("materials-view")).toBeInTheDocument();
    expect(screen.getByTestId("materials-count")).toHaveTextContent("1");
    expect(screen.getByTestId("categories-count")).toHaveTextContent("1");
    expect(screen.getByTestId("low-stock-count")).toHaveTextContent("0");
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await MaterialsContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("shows NoAccess for a role without INVENTORY_VIEW", async () => {
    // ACCOUNTANT lacks INVENTORY_VIEW
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await MaterialsContent();
    const { container } = render(ui);
    // NoAccess renders instead of MaterialsView
    expect(screen.queryByTestId("materials-view")).not.toBeInTheDocument();
    // The NoAccess component should render some content (not the page header).
    expect(container.textContent).not.toContain("Materials");
  });

  it("shows stock value stat in the page header", async () => {
    mockPrisma().material!.findMany
      .mockResolvedValueOnce([
        {
          id: "m1", code: "STL-001", name: "Steel", grade: null, specification: null,
          categoryId: "cat-1", unit: "KG", hsnCode: null, gstRate: 0, standardCost: 75,
          minStock: null, reorderPoint: null, economicOrderQty: null, volumetricDensity: null,
          bulkDiscountPct: null, isCorporateCommodity: false, isLotTracked: false, isScrap: false,
          baseUnit: "KG", secondaryUnit: null, uomConversionFactor: null, description: null,
          category: { id: "cat-1", name: "Steel", unit: "KG" },
          stockItems: [{ qty: 100, movingAvgCost: 50 }],
        },
      ])
      .mockResolvedValueOnce([]);

    const ui = await MaterialsContent();
    render(ui);
    // stockValue = 100 × 50 = 5000 → formatted as ₹5K (compact)
    expect(screen.getByTestId("stat-stock-value")).toHaveTextContent("₹5K");
  });
});
