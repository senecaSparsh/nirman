// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { DeleteConfirmDialog } from "./delete-confirm-dialog";

describe("DeleteConfirmDialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <DeleteConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        endpoint="/api/test/1"
        title="Delete"
        description="Sure?"
      />,
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders title and description when open", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        endpoint="/api/test/1"
        title="Delete Material"
        description="This will permanently delete the material."
      />,
    );
    expect(screen.getByText("Delete Material")).toBeInTheDocument();
    expect(screen.getByText("This will permanently delete the material.")).toBeInTheDocument();
  });

  it("renders Delete and Cancel buttons", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        endpoint="/api/test/1"
        title="Delete"
        description="Sure?"
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const { user } = render(
      <DeleteConfirmDialog
        open
        onOpenChange={onOpenChange}
        endpoint="/api/test/1"
        title="Delete"
        description="Sure?"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends DELETE request when Delete is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    const { user } = render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        endpoint="/api/test/1"
        title="Delete"
        description="Sure?"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/test/1", { method: "DELETE" });
    });
    fetchSpy.mockRestore();
  });

  it("shows Deleting... text while deleting", async () => {
    let resolveFn: (v: Response) => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((resolve) => { resolveFn = resolve; }),
    );
    const { user } = render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        endpoint="/api/test/1"
        title="Delete"
        description="Sure?"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeInTheDocument();
    resolveFn({ ok: true, json: async () => ({}) } as Response);
    fetchSpy.mockRestore();
  });
});
