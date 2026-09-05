// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { ConflictDialog } from "./conflict-dialog";

describe("ConflictDialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <ConflictDialog open={false} message="Conflict!" onReload={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText("Concurrent Edit Detected")).not.toBeInTheDocument();
  });

  it("renders title and message when open", () => {
    render(
      <ConflictDialog open message="Version mismatch." onReload={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Concurrent Edit Detected")).toBeInTheDocument();
    expect(screen.getByText(/Version mismatch/)).toBeInTheDocument();
  });

  it("renders both action buttons", () => {
    render(
      <ConflictDialog open message="Conflict" onReload={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Keep my changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeInTheDocument();
  });

  it("calls onReload when Reload latest is clicked", async () => {
    const onReload = vi.fn();
    const { user } = render(
      <ConflictDialog open message="Conflict" onReload={onReload} onCancel={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Keep my changes is clicked", async () => {
    const onCancel = vi.fn();
    const { user } = render(
      <ConflictDialog open message="Conflict" onReload={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: "Keep my changes" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders the explanatory body text", () => {
    render(
      <ConflictDialog open message="Conflict" onReload={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/Reloading will discard your unsaved changes/)).toBeInTheDocument();
  });
});
