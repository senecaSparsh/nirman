// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { BoqView, type BoqNode } from "./boq-view";

const materials = [{ id: "m1", code: "CEM-OPC53", name: "OPC Cement", unit: "BAG" }];

const tree: BoqNode[] = [
  {
    id: "n1",
    parentId: null,
    serialNo: "1",
    description: "Civil Works",
    type: "SECTION",
    unit: null,
    estimatedQty: null,
    rate: null,
    estimatedAmount: 100000,
    materialId: null,
    material: null,
    rateAnalysis: null,
    notes: null,
    sortOrder: 0,
    children: [
      {
        id: "n2",
        parentId: "n1",
        serialNo: "1.1",
        description: "Concrete work",
        type: "LINE_ITEM",
        unit: "CUM",
        estimatedQty: 100,
        rate: 5000,
        estimatedAmount: 500000,
        materialId: "m1",
        material: { code: "CEM-OPC53", name: "OPC Cement", unit: "BAG" },
        rateAnalysis: null,
        notes: null,
        sortOrder: 0,
        children: [],
      },
    ],
  },
];

describe("BoqView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders BOQ tree with section description", () => {
    render(<BoqView projectId="p1" tree={tree} totalEstimatedAmount={600000} materials={materials} canEdit />);
    expect(screen.getByText("Civil Works")).toBeInTheDocument();
  });

  it("renders total estimated amount", () => {
    render(<BoqView projectId="p1" tree={tree} totalEstimatedAmount={600000} materials={materials} canEdit />);
    expect(screen.getByText("Total Estimated Cost")).toBeInTheDocument();
  });

  it("renders Add Section button when canEdit is true", () => {
    render(<BoqView projectId="p1" tree={tree} totalEstimatedAmount={600000} materials={materials} canEdit />);
    expect(screen.getByText("Add Section")).toBeInTheDocument();
  });

  it("does not render Add Section when canEdit is false", () => {
    render(<BoqView projectId="p1" tree={tree} totalEstimatedAmount={600000} materials={materials} canEdit={false} />);
    expect(screen.queryByText("Add Section")).not.toBeInTheDocument();
  });

  it("expands section to show child line items", () => {
    render(<BoqView projectId="p1" tree={tree} totalEstimatedAmount={600000} materials={materials} canEdit />);
    // Click the chevron toggle button (first button in the section row)
    const toggleBtn = screen.getAllByRole("button")[0];
    fireEvent.click(toggleBtn!);
    expect(screen.getByText("Concrete work")).toBeInTheDocument();
  });

  it("renders table headers even when tree is empty", () => {
    render(<BoqView projectId="p1" tree={[]} totalEstimatedAmount={0} materials={materials} canEdit />);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Total Estimated Cost")).toBeInTheDocument();
  });
});
