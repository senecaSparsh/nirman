// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { CategoryFormDialog } from "./category-form-dialog";
import type { MaterialCategory } from "@/lib/types";

describe("CategoryFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(<CategoryFormDialog open={false} onOpenChange={vi.fn()} category={null} />);
    expect(screen.queryByText("New Material Category")).not.toBeInTheDocument();
  });

  it("renders create title and description when open with no category", () => {
    render(<CategoryFormDialog open onOpenChange={vi.fn()} category={null} />);
    expect(screen.getByText("New Material Category")).toBeInTheDocument();
    expect(
      screen.getByText("Categories group materials and define a default unit of measure."),
    ).toBeInTheDocument();
  });

  it("renders edit title when a category is provided", () => {
    const cat: MaterialCategory = { id: "c1", name: "Cement", unit: "BAG", class: "RAW_MATERIAL" };
    render(<CategoryFormDialog open onOpenChange={vi.fn()} category={cat} />);
    expect(screen.getByText("Edit Category")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cement")).toBeInTheDocument();
    expect(screen.getByDisplayValue("BAG")).toBeInTheDocument();
  });

  it("defaults unit to NOS and class to RAW_MATERIAL for new category", () => {
    render(<CategoryFormDialog open onOpenChange={vi.fn()} category={null} />);
    expect(screen.getByDisplayValue("NOS")).toBeInTheDocument();
    // The select shows the first option text
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("RAW_MATERIAL");
  });

  it("shows validation error when name is whitespace on submit", async () => {
    const { toast } = await import("sonner");
    render(<CategoryFormDialog open onOpenChange={vi.fn()} category={null} />);
    // Use whitespace to bypass HTML required validation but trigger JS trim check
    fireEvent.change(screen.getByPlaceholderText("e.g. Cement & Binding"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(toast.error).toHaveBeenCalledWith("Category name is required");
  });

  it("shows validation error when unit is whitespace on submit", async () => {
    const { toast } = await import("sonner");
    render(<CategoryFormDialog open onOpenChange={vi.fn()} category={null} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Cement & Binding"), {
      target: { value: "Steel" },
    });
    // Use whitespace to bypass HTML required validation but trigger JS trim check
    fireEvent.change(screen.getByPlaceholderText("BAG / KG / NOS"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(toast.error).toHaveBeenCalledWith("Default unit is required");
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<CategoryFormDialog open onOpenChange={onOpenChange} category={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits and calls onCreated for a new category", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new-cat", name: "Steel", unit: "KG", hsnCode: "7214", gstRate: 18 }),
    });
    render(<CategoryFormDialog open onOpenChange={onOpenChange} category={null} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Cement & Binding"), {
      target: { value: "Steel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: "new-cat", label: "Steel", unit: "KG", hsnCode: "7214", gstRate: 18 });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
