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

vi.mock("@/components/vendors/supplier-cockpit", () => ({
  SupplierCockpit: (props: { data: { supplier: { name: string; gstin: string | null } } }) => (
    <div data-testid="supplier-cockpit">
      <span data-testid="supplier-name">{props.data.supplier.name}</span>
      <span data-testid="supplier-gstin">{props.data.supplier.gstin ?? "—"}</span>
    </div>
  ),
}));

vi.mock("@/components/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { SupplierDetailContent } from "./content";

describe("SupplierDetailPage (SupplierDetailContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders SupplierCockpit with supplier data", async () => {
    mockPrisma().supplier!.findFirst.mockResolvedValue({
      id: "s1", name: "ABC Steel", gstin: "27ABCDE1234F1Z5", phone: "9876543210",
      email: "abc@steel.com", address: "Pune", balanceOwed: 50000, leadTimeDays: 7,
    });

    const params = Promise.resolve({ id: "s1" });
    const ui = await SupplierDetailContent({ params });
    render(ui);
    expect(screen.getByTestId("supplier-cockpit")).toBeInTheDocument();
    expect(screen.getByTestId("supplier-name")).toHaveTextContent("ABC Steel");
  });

  it("calls notFound when supplier does not exist", async () => {
    mockPrisma().supplier!.findFirst.mockResolvedValue(null);

    const params = Promise.resolve({ id: "nonexistent" });
    await expect(SupplierDetailContent({ params })).rejects.toThrow();
  });

  it("shows NoAccess for a role without PROCUREMENT_VIEW", async () => {
    setSessionUser({ role: "HR_MANAGER" });
    const params = Promise.resolve({ id: "s1" });
    const ui = await SupplierDetailContent({ params });
    render(ui);
    expect(screen.queryByTestId("supplier-cockpit")).not.toBeInTheDocument();
  });
});
