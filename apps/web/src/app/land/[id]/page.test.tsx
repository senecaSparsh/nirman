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
  scheduledTotal: vi.fn(() => 0),
  refreshLandTotalCost: vi.fn(async () => {}),
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/land/land-hub", () => ({
  LandHub: (props: { data: { purchase: { sellerName: string; totalCost: number } } }) => (
    <div data-testid="land-hub">
      <span data-testid="seller-name">{props.data.purchase.sellerName}</span>
      <span data-testid="total-cost">{props.data.purchase.totalCost}</span>
    </div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { LandDetailContent } from "./content";

describe("LandDetailPage (LandDetailContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders LandHub with land purchase data", async () => {
    mockPrisma().landPurchase!.findFirst.mockResolvedValue({
      id: "lp1", sellerName: "John Seller", sellerContact: "9876543210",
      purchaseDate: new Date("2024-01-15"), totalArea: 5000, areaUnit: "SQFT",
      totalCost: 5000000, registryNo: "REG-001", location: "Pune",
      documentUrl: null, projectId: null, project: null, mode: "PURCHASE",
      landType: null, leaseType: null, leasePeriodYears: null,
      leaseStartDate: null, leaseEndDate: null,
      baseCost: 4500000, leaseRentPercent: null, leaseRentAmount: null,
      gstPercent: null, gstAmount: null, registrationPercent: null,
      registrationAmount: 50000, stampDutyPercent: null, stampDutyAmount: 450000,
      brokerageAmount: null, legalFees: null, otherCharges: null,
      costComponents: [], purchaseStage: "COMPLETED",
      tokenAmount: null, tokenPaymentDate: null, tokenPaymentMode: null,
      atsDocumentUrl: null, atsDocumentName: null,
      registryDocumentUrl: null, registryDocumentName: null,
      isPossessed: false, possessionDate: null, possessionNotes: null,
      partialRegistryAllowed: false,
      payments: [], paymentSchedule: null,
      parcels: [],
    });

    const params = Promise.resolve({ id: "lp1" });
    const ui = await LandDetailContent({ params });
    render(ui);
    expect(screen.getByTestId("land-hub")).toBeInTheDocument();
    expect(screen.getByTestId("seller-name")).toHaveTextContent("John Seller");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("5000000");
  });

  it("calls notFound when land purchase does not exist", async () => {
    mockPrisma().landPurchase!.findFirst.mockResolvedValue(null);

    const params = Promise.resolve({ id: "nonexistent" });
    await expect(LandDetailContent({ params })).rejects.toThrow();
  });
});
