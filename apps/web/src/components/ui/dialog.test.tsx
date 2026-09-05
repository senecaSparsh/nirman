// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { Dialog } from "./dialog";

describe("Dialog", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Dialog open={false} onOpenChange={vi.fn()} title="Test Dialog">
        Content
      </Dialog>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders title and content when open", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="My Dialog">
        <p>Dialog body</p>
      </Dialog>,
    );
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Test" description="A description">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByText("A description")).toBeInTheDocument();
  });

  it("renders footer when provided", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Test" footer={<button>Submit</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("renders action node in header when provided", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Test" action={<button>Print</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when close button is clicked", async () => {
    const onOpenChange = vi.fn();
    const { user } = render(
      <Dialog open onOpenChange={onOpenChange} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has role dialog with aria-modal", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test");
  });

  it("does not render footer when not provided", () => {
    const { container } = render(
      <Dialog open onOpenChange={vi.fn()} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    expect(container.querySelector("footer")).toBeNull();
  });
});
