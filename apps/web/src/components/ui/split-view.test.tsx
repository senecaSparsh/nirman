// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { SplitView } from "./split-view";

describe("SplitView", () => {
  it("renders list content", () => {
    render(
      <SplitView
        list={<div>List item</div>}
        detail={null}
      />,
    );
    expect(screen.getByText("List item")).toBeInTheDocument();
  });

  it("renders detail content when provided", () => {
    render(
      <SplitView
        list={<div>List</div>}
        detail={<div>Detail content</div>}
      />,
    );
    expect(screen.getByText("Detail content")).toBeInTheDocument();
  });

  it("shows placeholder when detail is null", () => {
    render(
      <SplitView
        list={<div>List</div>}
        detail={null}
      />,
    );
    expect(screen.getByText("Select an item to view details")).toBeInTheDocument();
  });

  it("renders close button when onClose is provided and detail exists", () => {
    render(
      <SplitView
        list={<div>List</div>}
        detail={<div>Detail</div>}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Close detail panel" })).toBeInTheDocument();
  });

  it("does not render close button when detail is null", () => {
    render(
      <SplitView
        list={<div>List</div>}
        detail={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Close detail panel" })).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const { user } = render(
      <SplitView
        list={<div>List</div>}
        detail={<div>Detail</div>}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Close detail panel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render close button when onClose is not provided", () => {
    render(
      <SplitView
        list={<div>List</div>}
        detail={<div>Detail</div>}
      />,
    );
    expect(screen.queryByRole("button", { name: "Close detail panel" })).not.toBeInTheDocument();
  });
});
