// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { RequisitionFormDialog } from "./requisition-form-dialog";

const projects = [{ id: "p1", name: "Tower One" }];
const phases = [{ id: "ph1", name: "Foundation", projectId: "p1" }];
const materials = [
  { id: "m1", code: "CEM-OPC53", name: "OPC Cement 53 Grade", unit: "BAG" },
  { id: "m2", code: "STL-FE500", name: "TMT Steel Fe500", unit: "KG" },
];
const suppliers = [{ id: "s1", name: "Acme Supplies" }];

describe("RequisitionFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(
      <RequisitionFormDialog open={false} onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.queryByText("New Material Indent (Demand Slip)")).not.toBeInTheDocument();
  });

  it("renders dialog title and description when open", () => {
    render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.getByText("New Material Indent (Demand Slip)")).toBeInTheDocument();
    expect(screen.getByText(/Request materials for a project site/)).toBeInTheDocument();
  });

  it("renders project dropdown with project options", () => {
    render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.getByText("Tower One")).toBeInTheDocument();
  });

  it("renders material column headers in the editable grid", () => {
    render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Qty Requested")).toBeInTheDocument();
    expect(screen.getByText("Preferred Supplier")).toBeInTheDocument();
  });

  it("renders Add Row button", () => {
    render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.getByText("Add line")).toBeInTheDocument();
  });

  it("shows project validation error on submit without project", async () => {
    const { toast } = await import("sonner");
    const { container } = render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Select a project");
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <RequisitionFormDialog open onOpenChange={onOpenChange} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders Create Indent submit button", () => {
    render(
      <RequisitionFormDialog open onOpenChange={vi.fn()} projects={projects} phases={phases} materials={materials} suppliers={suppliers} />,
    );
    expect(screen.getByRole("button", { name: "Create Indent" })).toBeInTheDocument();
  });
});
