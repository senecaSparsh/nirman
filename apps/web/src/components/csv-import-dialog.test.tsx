// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { GenericCsvImportDialog } from "./csv-import-dialog";

describe("GenericCsvImportDialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <GenericCsvImportDialog
        open={false}
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Import Suppliers/)).not.toBeInTheDocument();
  });

  it("renders dialog title when open", () => {
    render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Import Suppliers from CSV")).toBeInTheDocument();
  });

  it("renders template download button", () => {
    render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  it("renders file upload area", () => {
    render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("Click to select CSV file")).toBeInTheDocument();
  });

  it("renders Cancel and Import buttons", () => {
    render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import 0 suppliers/ })).toBeInTheDocument();
  });

  it("Import button is disabled when no file is selected", () => {
    render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Import 0 suppliers/ })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    const { user } = render(
      <GenericCsvImportDialog
        open
        onClose={onClose}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders a hidden file input", () => {
    const { container } = render(
      <GenericCsvImportDialog
        open
        onClose={vi.fn()}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,phone"
        templateSample="John,9999999999"
        fieldMap={{ name: "name", phone: "phone" }}
        onSuccess={vi.fn()}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe(".csv,text/csv");
  });
});
