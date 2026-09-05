// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(<EmptyState icon={<span data-testid="ico" />} title="No materials yet" description="Add your first material to get started." />);
    expect(screen.getByText("No materials yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first material to get started.")).toBeInTheDocument();
  });

  it("renders the icon inside the dashed plate", () => {
    render(<EmptyState icon={<span data-testid="ico">📦</span>} title="Empty" />);
    expect(screen.getByTestId("ico")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    render(<EmptyState icon={<span />} title="Empty" hint="Try importing a CSV file." />);
    expect(screen.getByText("Try importing a CSV file.")).toBeInTheDocument();
  });

  it("renders the action when provided", () => {
    render(
      <EmptyState
        icon={<span />}
        title="Empty"
        action={<button>Add material</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Add material" })).toBeInTheDocument();
  });

  it("renders both primary and secondary actions", () => {
    render(
      <EmptyState
        icon={<span />}
        title="Empty"
        action={<button>Add material</button>}
        secondaryAction={<button>Import CSV</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Add material" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
  });

  it("shows contactHint when no action is provided", () => {
    render(<EmptyState icon={<span />} title="Empty" contactHint="Ask your admin to add materials." />);
    expect(screen.getByText("Ask your admin to add materials.")).toBeInTheDocument();
  });

  it("does not show contactHint when an action is provided", () => {
    render(
      <EmptyState
        icon={<span />}
        title="Empty"
        action={<button>Add</button>}
        contactHint="Ask your admin."
      />,
    );
    expect(screen.queryByText("Ask your admin.")).not.toBeInTheDocument();
  });

  it("does not render description/hint when not provided", () => {
    render(<EmptyState icon={<span />} title="Just a title" />);
    // Only the title text should be present — no extra paragraphs.
    expect(screen.getByText("Just a title")).toBeInTheDocument();
  });
});
