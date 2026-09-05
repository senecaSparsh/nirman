// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ExpenseFormDialog } from "./expense-form-dialog";
import type { ExpenseCategoryRow, ProjectOption } from "@/lib/types";

const projects: ProjectOption[] = [{ id: "p1", name: "Tower One", type: "RESIDENTIAL", status: "ACTIVE" }];
const categories: ExpenseCategoryRow[] = [
  { id: "cat1", name: "Travel", glAccountCode: "5001", description: null, isActive: true },
];
const suppliers = [{ id: "s1", name: "Acme" }];

describe("ExpenseFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when open is false", () => {
    render(
      <ExpenseFormDialog open={false} onOpenChange={vi.fn()} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    expect(screen.queryByText("Add Expense")).not.toBeInTheDocument();
  });

  it("renders Add Expense title when open with no editing", () => {
    render(
      <ExpenseFormDialog open onOpenChange={vi.fn()} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    expect(screen.getByText("Add Expense")).toBeInTheDocument();
  });

  it("renders Edit Expense title when editing", () => {
    render(
      <ExpenseFormDialog
        open
        onOpenChange={vi.fn()}
        projects={projects}
        categories={categories}
        suppliers={suppliers}
        editing={{
          id: "e1",
          projectId: null,
          categoryId: "cat1",
          category: "Travel",
          amount: 500,
          subtotal: 500,
          cgst: 0,
          sgst: 0,
          igst: 0,
          tdsAmount: 0,
          supplierId: null,
          payeeName: null,
          paymentMode: "CASH",
          bankAccount: null,
          chequeNo: null,
          chequeDate: null,
          chequePhotoUrl: null,
          referenceNo: null,
          receiptUrl: null,
          date: "2024-01-15",
          notes: null,
          status: "DRAFT",
        }}
      />,
    );
    expect(screen.getByText("Edit Expense")).toBeInTheDocument();
  });

  it("renders Expense Details title when editing a locked (PENDING) expense", () => {
    render(
      <ExpenseFormDialog
        open
        onOpenChange={vi.fn()}
        projects={projects}
        categories={categories}
        suppliers={suppliers}
        editing={{
          id: "e1",
          projectId: null,
          categoryId: "cat1",
          category: "Travel",
          amount: 500,
          subtotal: 500,
          cgst: 0,
          sgst: 0,
          igst: 0,
          tdsAmount: 0,
          supplierId: null,
          payeeName: null,
          paymentMode: "CASH",
          bankAccount: null,
          chequeNo: null,
          chequeDate: null,
          chequePhotoUrl: null,
          referenceNo: null,
          receiptUrl: null,
          date: "2024-01-15",
          notes: null,
          status: "PENDING",
        }}
      />,
    );
    expect(screen.getByText("Expense Details")).toBeInTheDocument();
  });

  it("shows category validation error on submit without category", async () => {
    const { toast } = await import("sonner");
    const { container } = render(
      <ExpenseFormDialog open onOpenChange={vi.fn()} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Category is required");
  });

  it("shows amount validation error when amount is 0", async () => {
    const { toast } = await import("sonner");
    const { container } = render(
      <ExpenseFormDialog open onOpenChange={vi.fn()} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    // Fill category name in the auto-filled input
    fireEvent.change(screen.getByPlaceholderText("Category name (auto-filled from master, editable)"), {
      target: { value: "Travel" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Amount must be greater than 0");
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ExpenseFormDialog open onOpenChange={onOpenChange} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders payment mode dropdown with options", () => {
    render(
      <ExpenseFormDialog open onOpenChange={vi.fn()} projects={projects} categories={categories} suppliers={suppliers} />,
    );
    expect(screen.getByText("CASH")).toBeInTheDocument();
    expect(screen.getByText("UPI")).toBeInTheDocument();
    expect(screen.getByText("CHEQUE")).toBeInTheDocument();
  });
});
