// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Confirm"
        description="Are you sure?"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("renders title and description when open", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete Item"
        description="This cannot be undone."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("renders default confirm and cancel labels", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Confirm"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders custom confirm and cancel labels", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Confirm"
        description="Sure?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, keep" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Sure?"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const { user } = render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes dialog after successful confirm", async () => {
    const onOpenChange = vi.fn();
    const { user } = render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Sure?"
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
