// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";
import { MaterialCockpit, type MaterialCockpitData } from "./material-cockpit";

const baseData: MaterialCockpitData = {
  material: {
    id: "m1",
    code: "CEM-OPC53",
    name: "OPC Cement 53 Grade",
    unit: "BAG",
    categoryName: "Cement & Binding",
    hsnCode: "25232900",
    gstRate: 28,
    currentCost: 350,
    standardCost: 340,
    minStock: 50,
    reorderPoint: 100,
    economicOrderQty: 200,
    isScrap: false,
    isLotTracked: false,
    description: "High quality cement",
  },
  stockItems: [
    { locationId: "loc1", locationName: "Main Warehouse", locationType: "COMPANY_WAREHOUSE", qty: 500, movingAvgCost: 350, totalValue: 175000 },
    { locationId: "loc2", locationName: "Site A", locationType: "PROJECT_SITE", qty: 100, movingAvgCost: 355, totalValue: 35500 },
  ],
  movements: [
    { id: "mv1", movementType: "PURCHASE_RECEIPT", qty: 500, unitCost: 350, fromLocationName: null, toLocationName: "Main Warehouse", timestamp: "2024-01-15T10:00:00Z" },
    { id: "mv2", movementType: "ISSUE_TO_PROJECT", qty: 50, unitCost: 350, fromLocationName: "Main Warehouse", toLocationName: "Site A", timestamp: "2024-01-20T10:00:00Z" },
  ],
  openPOs: [
    { poId: "po1", poNumber: "PO-001", status: "OPEN", supplierName: "Acme Supplies", qtyOrdered: 200, qtyReceived: 0, unitCost: 345, expectedDate: "2024-02-01" },
  ],
  openRequisitions: [
    { reqId: "r1", reqNumber: "REQ-001", status: "PENDING", projectName: "Tower One", qty: 100 },
  ],
  rateContracts: [
    { id: "rc1", supplierName: "Acme Supplies", rate: 340, validUntil: "2024-12-31" },
  ],
  issues: [
    { issueId: "i1", issueNumber: "ISS-001", issueDate: "2024-01-20", projectName: "Tower One", fromLocationName: "Main Warehouse", qty: 50, unitCost: 350 },
  ],
};

describe("MaterialCockpit", () => {
  it("renders material name and code badge", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.getByText("OPC Cement 53 Grade")).toBeInTheDocument();
    expect(screen.getByText("CEM-OPC53")).toBeInTheDocument();
  });

  it("renders back link to materials", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.getByText("← Materials")).toBeInTheDocument();
  });

  it("renders Adjust Stock button", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.getByText("Adjust Stock")).toBeInTheDocument();
  });

  it("shows low stock alert when total qty is at or below reorder point", () => {
    const lowStockData: MaterialCockpitData = {
      ...baseData,
      stockItems: [{ locationId: "loc1", locationName: "Main Warehouse", locationType: "COMPANY_WAREHOUSE", qty: 50, movingAvgCost: 350, totalValue: 17500 }],
    };
    render(<MaterialCockpit data={lowStockData} />);
    expect(screen.getByText("Below reorder point")).toBeInTheDocument();
  });

  it("does not show low stock alert when qty is above reorder point", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.queryByText("Below reorder point")).not.toBeInTheDocument();
  });

  it("renders all five tab triggers with counts", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Stock/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Movements/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Procurement/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Consumption/ })).toBeInTheDocument();
  });

  it("shows stock by location in overview tab", () => {
    render(<MaterialCockpit data={baseData} />);
    expect(screen.getByText("Stock by Location")).toBeInTheDocument();
    expect(screen.getByText("Main Warehouse")).toBeInTheDocument();
    expect(screen.getByText("Site A")).toBeInTheDocument();
  });

  it("shows lot-tracked badge and View Lots button when material is lot tracked", () => {
    const lotData: MaterialCockpitData = {
      ...baseData,
      material: { ...baseData.material, isLotTracked: true },
    };
    render(<MaterialCockpit data={lotData} />);
    expect(screen.getByText("Lot-tracked")).toBeInTheDocument();
    expect(screen.getByText("View Lots")).toBeInTheDocument();
  });

  it("switches to movements tab and shows movement labels", () => {
    render(<MaterialCockpit data={baseData} />);
    fireEvent.click(screen.getByRole("tab", { name: /Movements/ }));
    // The movements tab renders all movements with labels
    expect(screen.getAllByText("Receipt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Issue").length).toBeGreaterThan(0);
  });
});
