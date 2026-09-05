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

vi.mock("@/components/materials/material-cockpit", () => ({
  MaterialCockpit: (props: { data: { material: { name: string; code: string } } }) => (
    <div data-testid="material-cockpit">
      <span data-testid="material-name">{props.data.material.name}</span>
      <span data-testid="material-code">{props.data.material.code}</span>
    </div>
  ),
}));

vi.mock("@/components/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { MaterialDetailContent } from "./page";

describe("MaterialDetailPage (MaterialDetailContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders MaterialCockpit with material data", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue({
      id: "m1", code: "STL-001", name: "Steel TMT", unit: "KG",
      hsnCode: "7213", gstRate: 18, currentCost: 75, standardCost: 70,
      minStock: 100, reorderPoint: 50, economicOrderQty: 200,
      isScrap: false, isLotTracked: false, description: "TMT bars",
      category: { name: "Steel" },
      stockItems: [],
    });

    const params = Promise.resolve({ id: "m1" });
    const ui = await MaterialDetailContent({ params });
    render(ui);
    expect(screen.getByTestId("material-cockpit")).toBeInTheDocument();
    expect(screen.getByTestId("material-name")).toHaveTextContent("Steel TMT");
    expect(screen.getByTestId("material-code")).toHaveTextContent("STL-001");
  });

  it("calls notFound when material does not exist", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);

    const params = Promise.resolve({ id: "nonexistent" });
    await expect(MaterialDetailContent({ params })).rejects.toThrow();
  });

  it("shows NoAccess for a role without INVENTORY_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const params = Promise.resolve({ id: "m1" });
    const ui = await MaterialDetailContent({ params });
    render(ui);
    expect(screen.queryByTestId("material-cockpit")).not.toBeInTheDocument();
  });
});
