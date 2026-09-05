// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { LandPurchaseFormDialog } from "./land-purchase-form-dialog";
import type { ProjectOption } from "@/lib/types";

const projects: ProjectOption[] = [
  { id: "p1", name: "Tower One", type: "RESIDENTIAL", status: "ACTIVE" },
];

describe("LandPurchaseFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(<LandPurchaseFormDialog open={false} onOpenChange={vi.fn()} projects={projects} />);
    expect(screen.queryByText("Record Land Purchase")).not.toBeInTheDocument();
  });

  it("renders create title and description when open", () => {
    render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    expect(screen.getByText("Record Land Purchase")).toBeInTheDocument();
    expect(
      screen.getByText(/A land purchase creates an initial parcel covering the full area/),
    ).toBeInTheDocument();
  });

  it("renders edit title when editing prop is provided", () => {
    render(
      <LandPurchaseFormDialog
        open
        onOpenChange={vi.fn()}
        projects={projects}
        editing={{
          id: "lp1",
          projectId: "p1",
          sellerName: "Ramesh",
          sellerContact: "9876543210",
          purchaseDate: "2024-01-15",
          totalArea: 12000,
          areaUnit: "SQFT",
          totalCost: 5000000,
          registryNo: "REG-001",
          location: "Pune",
          documentUrl: null,
        }}
      />,
    );
    expect(screen.getByText("Edit Land Purchase")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ramesh")).toBeInTheDocument();
  });

  it("renders all area unit options", () => {
    render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    // The area unit <select> has options with these labels
    expect(screen.getByText("Sq.Ft")).toBeInTheDocument();
    expect(screen.getByText("Sq.Mtr")).toBeInTheDocument();
    expect(screen.getByText("Acre")).toBeInTheDocument();
    expect(screen.getByText("Bigha")).toBeInTheDocument();
  });

  it("shows cost per sqft when both area and cost are entered", () => {
    render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. 12000"), { target: { value: "12000" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 5000000"), { target: { value: "5000000" } });
    // 5000000 / 12000 = ~416.67 per sqft
    expect(screen.getByText(/sqft/)).toBeInTheDocument();
  });

  it("renders initial parcel number field in create mode only", () => {
    const { rerender } = render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    expect(screen.getByPlaceholderText("PLOT-1 (default)")).toBeInTheDocument();
    rerender(
      <LandPurchaseFormDialog
        open
        onOpenChange={vi.fn()}
        projects={projects}
        editing={{
          id: "lp1",
          projectId: null,
          sellerName: "Ramesh",
          sellerContact: "",
          purchaseDate: "",
          totalArea: 100,
          areaUnit: "SQFT",
          totalCost: 1000,
          registryNo: "",
          location: "",
          documentUrl: null,
        }}
      />,
    );
    expect(screen.queryByPlaceholderText("PLOT-1 (default)")).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<LandPurchaseFormDialog open onOpenChange={onOpenChange} projects={projects} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows seller name validation error on submit without seller name", async () => {
    const { toast } = await import("sonner");
    const { container } = render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    fireEvent.submit(container.querySelector("form")!);
    // The seller name check uses toast.error directly (no return value check needed)
    expect(toast.error).toHaveBeenCalledWith("Seller name is required");
  });

  it("shows form validation error when required fields are missing", async () => {
    const { toast } = await import("sonner");
    const { container } = render(<LandPurchaseFormDialog open onOpenChange={vi.fn()} projects={projects} />);
    // Fill seller name but leave area/cost/parcel empty
    fireEvent.change(screen.getByPlaceholderText("e.g. Suresh Patel"), { target: { value: "Test Seller" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Please fix the errors in the form");
  });
});
