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

vi.mock("@/components/projects/project-hub", () => ({
  ProjectHub: (props: { data: { project: { name: string }; stats: { builtUnitCount: number } } }) => (
    <div data-testid="project-hub">
      <span data-testid="project-name">{props.data.project.name}</span>
      <span data-testid="unit-count">{props.data.stats.builtUnitCount}</span>
    </div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { ProjectDetailContent } from "./content";

describe("ProjectDetailPage (ProjectDetailContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders ProjectHub with project data", async () => {
    mockPrisma().project!.findFirst.mockResolvedValue({
      id: "p1", name: "Tower A", type: "RESIDENTIAL", status: "ACTIVE", address: "123 Main St",
      description: "A big tower", startDate: new Date("2024-01-01"), endDate: null,
      totalBudget: 1000000, totalProjectCost: 500000, costPerSqft: null, totalSellableArea: null,
      reraNumber: null, reraRegistrationDate: null, reraValidityDate: null, reraWebsiteUrl: null,
      lciThreshold: null, isPossessed: false, possessionDate: null, possessionNotes: null,
      phases: [], stockLocations: [],
    });

    const params = Promise.resolve({ id: "p1" });
    const ui = await ProjectDetailContent({ params });
    render(ui);
    expect(screen.getByTestId("project-hub")).toBeInTheDocument();
    expect(screen.getByTestId("project-name")).toHaveTextContent("Tower A");
  });

  it("calls notFound when project does not exist", async () => {
    mockPrisma().project!.findFirst.mockResolvedValue(null);

    const params = Promise.resolve({ id: "nonexistent" });
    await expect(ProjectDetailContent({ params })).rejects.toThrow();
  });

  it("renders ProjectHub with unit count from built units", async () => {
    mockPrisma().project!.findFirst.mockResolvedValue({
      id: "p1", name: "Tower B", type: "COMMERCIAL", status: "ACTIVE", address: null,
      description: null, startDate: null, endDate: null,
      totalBudget: null, totalProjectCost: null, costPerSqft: null, totalSellableArea: null,
      reraNumber: null, reraRegistrationDate: null, reraValidityDate: null, reraWebsiteUrl: null,
      lciThreshold: null, isPossessed: false, possessionDate: null, possessionNotes: null,
      phases: [], stockLocations: [],
    });
    mockPrisma().builtUnit!.findMany.mockResolvedValue([
      { id: "u1", projectId: "p1", unitNumber: "101", unitType: "SHOP", status: "AVAILABLE", phaseId: null, phase: null, floor: 1, wing: "A", area: 500, areaUnit: "SQFT", originType: "CREATED", acquisitionCost: 0, purchaseDate: null, landParcelId: null, productionCost: 0, askingPrice: null, currentValuation: 0, nrvWriteDown: 0, saleId: null, assetSales: [] },
      { id: "u2", projectId: "p1", unitNumber: "102", unitType: "SHOP", status: "SOLD", phaseId: null, phase: null, floor: 1, wing: "A", area: 500, areaUnit: "SQFT", originType: "CREATED", acquisitionCost: 0, purchaseDate: null, landParcelId: null, productionCost: 0, askingPrice: null, currentValuation: 0, nrvWriteDown: 0, saleId: "s1", assetSales: [{ id: "s1", saleNumber: "SAL-001", salePrice: 1000000, profit: 200000, saleDate: new Date("2024-06-01"), paymentStatus: "PAID", customer: { name: "John" } }] },
    ]);

    const params = Promise.resolve({ id: "p1" });
    const ui = await ProjectDetailContent({ params });
    render(ui);
    expect(screen.getByTestId("unit-count")).toHaveTextContent("2");
  });
});
