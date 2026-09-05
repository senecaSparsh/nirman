// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { SaleDetailDialog } from "./sale-detail-dialog";
import type { AssetSaleRow } from "@/lib/types";

function makeSale(overrides: Partial<AssetSaleRow> = {}): AssetSaleRow {
  return {
    id: "sale-1",
    saleNumber: "SALE-001",
    assetType: "BUILT_UNIT",
    landParcelId: null,
    landParcelNumber: null,
    builtUnitId: "u1",
    builtUnitNumber: "101",
    builtUnitType: "BHK_2",
    assetArea: 1200,
    assetAreaUnit: "SQFT",
    customerId: "c1",
    customerName: "John Doe",
    customerPhone: "9876543210",
    projectId: "p1",
    projectName: "Tower One",
    salePrice: 5000000,
    gstRate: 5,
    gstAmount: 250000,
    costBasis: 3000000,
    profit: 2000000,
    saleDate: "2024-01-15T00:00:00Z",
    status: "ACTIVE",
    saleStage: "PENDING",
    depositAmount: null,
    depositDate: null,
    finalSaleDate: null,
    saleDeedNo: null,
    expectedRegistryDate: null,
    atsNo: null,
    atsDate: null,
    allowRegistryBeforeFullPayment: false,
    allotmentLetterNo: null,
    allotmentDate: null,
    bbaNo: null,
    bbaDate: null,
    tdsAmount: null,
    tdsCertificateNo: null,
    homeLoanBank: null,
    homeLoanAmount: null,
    homeLoanSanctionNo: null,
    homeLoanSanctionDate: null,
    dealMaturityMonths: null,
    dealMaturityDate: null,
    paymentCycle: null,
    dealSource: "SELF",
    brokerId: null,
    brokerName: null,
    brokerPhone: null,
    brokerAgency: null,
    commissionAmount: null,
    commissionIsPartOfDeal: false,
    commissionPaid: false,
    commissionPaidDate: null,
    expenses: [],
    terms: [],
    paymentSchedule: null,
    paymentStatus: "PENDING",
    paymentMode: null,
    notes: null,
    totalPaid: 0,
    balanceDue: 5000000,
    paymentCount: 0,
    atsDocumentUrl: null,
    atsDocumentName: null,
    bbaDocumentUrl: null,
    bbaDocumentName: null,
    registryDocumentUrl: null,
    registryDocumentName: null,
    allotmentDocumentUrl: null,
    allotmentDocumentName: null,
    draftDocumentUrl: null,
    draftDocumentName: null,
    draftNotes: null,
    draftDate: null,
    irn: null,
    irnAckNo: null,
    irnAckDate: null,
    irnQrCode: null,
    irnStatus: null,
    irnError: null,
    irnGeneratedAt: null,
    irnCancelledAt: null,
    ...overrides,
  };
}

describe("SaleDetailDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...makeSale(), payments: [] }),
    });
  });

  it("renders nothing when sale is null", () => {
    const { container } = render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders sale number as dialog title when open", () => {
    render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} />);
    expect(screen.getByText("SALE-001")).toBeInTheDocument();
  });

  it("renders asset label and customer name in description", () => {
    render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} />);
    expect(screen.getByText(/Unit 101/)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it("shows loading state initially then loads detail", async () => {
    render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
  });

  it("shows Record Deposit button for pending sale with manage permissions", async () => {
    render(
      <SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} permissions={{ canManage: true }} />,
    );
    await waitFor(() => {
      // Two "Record Deposit" buttons render: one in action bar, one in pending prompt
      expect(screen.getAllByRole("button", { name: /Record Deposit/ }).length).toBeGreaterThan(0);
    });
  });

  it("does not show Record Deposit for completed sale", async () => {
    render(
      <SaleDetailDialog
        open
        onOpenChange={vi.fn()}
        sale={makeSale({ saleStage: "COMPLETED", status: "ACTIVE", balanceDue: 0 })}
        permissions={{ canManage: true }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Record Deposit/ })).not.toBeInTheDocument();
    });
  });

  it("shows Cancel Sale button for pending sale with manage permissions", async () => {
    render(
      <SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} permissions={{ canManage: true }} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Cancel Sale")).toBeInTheDocument();
    });
  });

  it("does not show action buttons without manage permissions", async () => {
    render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} permissions={{ canManage: false }} />);
    await waitFor(() => {
      expect(screen.queryByText("Record Deposit")).not.toBeInTheDocument();
      expect(screen.queryByText("Cancel Sale")).not.toBeInTheDocument();
    });
  });

  it("renders print form and invoice links", async () => {
    render(<SaleDetailDialog open onOpenChange={vi.fn()} sale={makeSale()} />);
    await waitFor(() => {
      expect(screen.getByText("Print Form")).toBeInTheDocument();
      expect(screen.getByText("Print Invoice")).toBeInTheDocument();
    });
  });

  it("shows deposit info when deposit amount is set", async () => {
    render(
      <SaleDetailDialog
        open
        onOpenChange={vi.fn()}
        sale={makeSale({ saleStage: "DEPOSIT_RECEIVED", depositAmount: 500000, depositDate: "2024-02-01" })}
        permissions={{ canManage: true }}
      />,
    );
    await waitFor(() => {
      // Deposit info shows the formatted amount
      expect(screen.getByText(/Deposit:/)).toBeInTheDocument();
    });
  });
});
