// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { CsvImportDialog } from "./csv-import-dialog";

const categories = [
  { id: "cat1", name: "Cement & Binding", unit: "BAG" },
  { id: "cat2", name: "Steel & Rebar", unit: "KG" },
];

describe("CsvImportDialog (materials)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(<CsvImportDialog open={false} onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    expect(screen.queryByText("Import Materials from CSV")).not.toBeInTheDocument();
  });

  it("renders dialog title and template button when open", () => {
    render(<CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    expect(screen.getByText("Import Materials from CSV")).toBeInTheDocument();
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  it("renders file upload area with placeholder text", () => {
    render(<CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    expect(screen.getByText("Click to select CSV file")).toBeInTheDocument();
  });

  it("renders Cancel and Import buttons", () => {
    render(<CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 0 materials" })).toBeInTheDocument();
  });

  it("Import button is disabled when no file selected and no default category", () => {
    render(<CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Import 0 materials" })).toBeDisabled();
  });

  it("renders a hidden file input with csv accept", () => {
    const { container } = render(
      <CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe(".csv,text/csv");
  });

  it("renders default category dropdown with category options", () => {
    render(<CsvImportDialog open onClose={vi.fn()} categories={categories} onSuccess={vi.fn()} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Cement & Binding")).toBeInTheDocument();
    expect(screen.getByText("Steel & Rebar")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<CsvImportDialog open onClose={onClose} categories={categories} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
