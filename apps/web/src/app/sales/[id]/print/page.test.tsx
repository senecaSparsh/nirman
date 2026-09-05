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

const mockSaleData = {
  sale: {
    id: "s1", saleNumber: "SAL-001", salePrice: 5000000, gstAmount: 0, gstRate: 0,
    saleDate: new Date("2024-06-01").toISOString(), assetType: "LAND",
    dealSource: "DIRECT", notes: "Test sale",
    company: { name: "Test Co", address: "Pune", gstin: "27ABC1234F1Z5", phone: "9876543210", email: "test@co.com" },
    customer: { name: "John Buyer", phone: "9876543210", email: "john@buy.com", address: "Mumbai" },
    project: { name: "Tower A" },
    builtUnit: null,
    payments: [],
    expenses: [],
    terms: [],
    paymentSchedule: null,
    broker: null, brokerName: null, brokerPhone: null,
    commissionAmount: null, commissionIsPartOfDeal: false, commissionPaid: false,
    allotmentLetterNo: null, allotmentDate: null,
    bbaNo: null, bbaDate: null, saleDeedNo: null, expectedRegistryDate: null,
    homeLoanBank: null, homeLoanAmount: null, homeLoanSanctionNo: null,
    tdsAmount: null, tdsCertificateNo: null,
    dealMaturityMonths: null, dealMaturityDate: null, paymentCycle: null,
  },
  landParcel: { number: "PLOT-1", area: 5000, areaUnit: "SQFT" },
  projectUnits: [],
};

vi.mock("@nirman/services", () => ({
  getPrintableSaleData: vi.fn(async () => mockSaleData),
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/print/print-header", () => ({
  PrintHeader: (props: { title: string; docNumber: string }) => (
    <div data-testid="print-header">
      <span data-testid="print-title">{props.title}</span>
      <span data-testid="doc-number">{props.docNumber}</span>
    </div>
  ),
}));

vi.mock("./print-button", () => ({
  PrintButton: () => <button data-testid="print-button">Print</button>,
}));

import { getPrintableSaleData } from "@nirman/services";
import PrintableSaleFormPage from "./page";

describe("PrintableSaleFormPage", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    vi.mocked(getPrintableSaleData).mockResolvedValue(mockSaleData as any);
  });

  it("renders the Sale Booking Form title", async () => {
    const params = Promise.resolve({ id: "s1" });
    const ui = await PrintableSaleFormPage({ params });
    render(ui);
    expect(screen.getByTestId("print-title")).toHaveTextContent("Sale Booking Form");
  });

  it("renders the sale number in the header", async () => {
    const params = Promise.resolve({ id: "s1" });
    const ui = await PrintableSaleFormPage({ params });
    render(ui);
    expect(screen.getByTestId("doc-number")).toHaveTextContent("SAL-001");
  });

  it("renders Party Details section with seller and buyer", async () => {
    const params = Promise.resolve({ id: "s1" });
    const ui = await PrintableSaleFormPage({ params });
    render(ui);
    expect(screen.getByText("Party Details")).toBeInTheDocument();
    expect(screen.getByText("Test Co")).toBeInTheDocument();
    expect(screen.getByText("John Buyer")).toBeInTheDocument();
  });

  it("renders Financial Summary section with Deal Price", async () => {
    const params = Promise.resolve({ id: "s1" });
    const ui = await PrintableSaleFormPage({ params });
    render(ui);
    expect(screen.getByText("Financial Summary")).toBeInTheDocument();
    expect(screen.getByText("Deal Price")).toBeInTheDocument();
  });

  it("renders the print button", async () => {
    const params = Promise.resolve({ id: "s1" });
    const ui = await PrintableSaleFormPage({ params });
    render(ui);
    expect(screen.getByTestId("print-button")).toBeInTheDocument();
  });

  it("calls notFound when getPrintableSaleData throws", async () => {
    vi.mocked(getPrintableSaleData).mockRejectedValue(new Error("not found"));
    const params = Promise.resolve({ id: "nonexistent" });
    await expect(PrintableSaleFormPage({ params })).rejects.toThrow();
  });
});
