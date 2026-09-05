// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { MaterialFormDialog } from "./material-form-dialog";
import type { MaterialCategory, MaterialRow } from "@/lib/types";

const categories: MaterialCategory[] = [
  { id: "cat1", name: "Cement & Binding", unit: "BAG" },
  { id: "cat2", name: "Steel & Rebar", unit: "KG" },
];

const material: MaterialRow = {
  id: "m1",
  code: "CEM-OPC53",
  name: "OPC Cement 53 Grade",
  grade: "OPC 53",
  specification: "IS 269",
  categoryId: "cat1",
  categoryName: "Cement & Binding",
  unit: "BAG",
  hsnCode: "25232900",
  gstRate: 28,
  standardCost: 350,
  minStock: 50,
  reorderPoint: 100,
  economicOrderQty: 200,
  volumetricDensity: null,
  bulkDiscountPct: null,
  isCorporateCommodity: false,
  isLotTracked: false,
  isScrap: false,
  baseUnit: "",
  secondaryUnit: null,
  uomConversionFactor: null,
  description: "High quality cement",
  totalQty: 500,
  totalValue: 175000,
  lowStock: false,
};

describe("MaterialFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(
      <MaterialFormDialog open={false} onOpenChange={vi.fn()} categories={categories} material={null} />,
    );
    expect(screen.queryByText("New Material")).not.toBeInTheDocument();
  });

  it("renders create title and description when open with no material", () => {
    render(<MaterialFormDialog open onOpenChange={vi.fn()} categories={categories} material={null} />);
    expect(screen.getByText("New Material")).toBeInTheDocument();
    expect(screen.getByText("Add a new material to your catalogue.")).toBeInTheDocument();
  });

  it("renders edit title and disables the code field when editing", () => {
    render(<MaterialFormDialog open onOpenChange={vi.fn()} categories={categories} material={material} />);
    expect(screen.getByText("Edit Material")).toBeInTheDocument();
    expect(screen.getByText("Update material details.")).toBeInTheDocument();
    const codeInput = screen.getByPlaceholderText("CEM-OPC53");
    expect(codeInput).toBeDisabled();
    // Auto button should not appear in edit mode
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
  });

  it("shows Auto button in create mode", () => {
    render(<MaterialFormDialog open onOpenChange={vi.fn()} categories={categories} material={null} />);
    expect(screen.getByText("Auto")).toBeInTheDocument();
  });

  it("populates form fields from the material in edit mode", () => {
    render(<MaterialFormDialog open onOpenChange={vi.fn()} categories={categories} material={material} />);
    expect(screen.getByDisplayValue("OPC Cement 53 Grade")).toBeInTheDocument();
    expect(screen.getByDisplayValue("BAG")).toBeInTheDocument();
    expect(screen.getByDisplayValue("28")).toBeInTheDocument(); // gstRate
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<MaterialFormDialog open onOpenChange={onOpenChange} categories={categories} material={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows category validation error when no category selected", async () => {
    const { toast } = await import("sonner");
    const { container } = render(
      <MaterialFormDialog open onOpenChange={vi.fn()} categories={categories} material={null} />,
    );
    // Fill code/name/unit so those JS checks pass, but leave category empty.
    // Use fireEvent.submit to bypass native HTML required validation on the select.
    fireEvent.change(screen.getByPlaceholderText("CEM-OPC53"), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByPlaceholderText("Cement OPC 53 Grade"), { target: { value: "Test Material" } });
    fireEvent.change(screen.getByPlaceholderText("BAG / KG / NOS / MTR"), { target: { value: "NOS" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Please select a category");
  });

  it("submits successfully and calls onCreated in create mode", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new-mat", name: "Test Material" }),
    });
    render(
      <MaterialFormDialog open onOpenChange={onOpenChange} categories={categories} material={null} onCreated={onCreated} />,
    );
    fireEvent.change(screen.getByPlaceholderText("CEM-OPC53"), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByPlaceholderText("Cement OPC 53 Grade"), { target: { value: "Test Material" } });
    // Select category from the native select
    fireEvent.change(screen.getByDisplayValue("Select category…"), { target: { value: "cat1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create material" }));
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: "new-mat", label: "Test Material" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
