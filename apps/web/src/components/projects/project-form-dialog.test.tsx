// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ProjectFormDialog } from "./project-form-dialog";

describe("ProjectFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(<ProjectFormDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("New Project")).not.toBeInTheDocument();
  });

  it("renders create title and description when open", () => {
    render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("New Project")).toBeInTheDocument();
    expect(screen.getByText("Create a new construction or development project (site).")).toBeInTheDocument();
  });

  it("renders edit title when projectId is provided", () => {
    render(<ProjectFormDialog open onOpenChange={vi.fn()} projectId="p1" />);
    expect(screen.getByText("Edit Project")).toBeInTheDocument();
    expect(screen.getByText("Update project details.")).toBeInTheDocument();
  });

  it("renders all type options in the type select", () => {
    render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    const typeSelect = screen.getByLabelText("Type");
    expect(typeSelect).toBeInTheDocument();
    expect(screen.getByText("Residential")).toBeInTheDocument();
    expect(screen.getByText("Commercial")).toBeInTheDocument();
    expect(screen.getByText("Warehouse")).toBeInTheDocument();
    expect(screen.getByText("Land Development")).toBeInTheDocument();
  });

  it("renders all status options in the status select", () => {
    render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("On Hold")).toBeInTheDocument();
  });

  it("renders ATS section in create mode but not edit mode", () => {
    const { rerender } = render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Agreement to Sell (ATS)")).toBeInTheDocument();
    rerender(<ProjectFormDialog open onOpenChange={vi.fn()} projectId="p1" />);
    expect(screen.queryByText("Agreement to Sell (ATS)")).not.toBeInTheDocument();
  });

  it("toggles ATS fields when Yes ATS is clicked", () => {
    render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    // Initially No ATS is selected — registry field visible
    expect(screen.getByText("Registry / Sale Deed No.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Yes, ATS"));
    expect(screen.getByText("Registration Amount (₹)")).toBeInTheDocument();
    expect(screen.getByText("Expected Registry Date")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<ProjectFormDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows name validation error on submit with empty name", async () => {
    const { toast } = await import("sonner");
    const { container } = render(<ProjectFormDialog open onOpenChange={vi.fn()} />);
    // fireEvent.submit bypasses native required validation
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Project name is required");
  });

  it("submits successfully and calls onCreated in create mode", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new-proj", name: "Tower One" }),
    });
    render(<ProjectFormDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Apex Center — Tower One"), {
      target: { value: "Tower One" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: "new-proj", label: "Tower One" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
