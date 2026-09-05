// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { Badge, CountChip } from "./badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies the default variant and size classes", () => {
    render(<Badge data-testid="b">Default</Badge>);
    const el = screen.getByTestId("b");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("border");
  });

  it.each([
    ["brand"],
    ["success"],
    ["warning"],
    ["danger"],
    ["info"],
    ["outline"],
    ["muted"],
    ["solid"],
  ] as const)("renders variant %s without crashing", (variant) => {
    render(<Badge variant={variant}>{variant}</Badge>);
    expect(screen.getByText(variant)).toBeInTheDocument();
  });

  it.each(["sm", "default", "lg"] as const)("renders size %s without crashing", (size) => {
    render(<Badge size={size}>S</Badge>);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("renders a dot when dot prop is true", () => {
    render(<Badge dot>Dotted</Badge>);
    const badge = screen.getByText("Dotted");
    const dot = badge.querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("rounded-full");
  });

  it("does not render a dot when dot prop is not set", () => {
    render(<Badge>No dot</Badge>);
    const badge = screen.getByText("No dot");
    const dot = badge.querySelector("span");
    expect(dot).toBeNull();
  });

  it("passes through additional HTML attributes", () => {
    render(<Badge title="hello">With title</Badge>);
    expect(screen.getByText("With title")).toHaveAttribute("title", "hello");
  });
});

describe("CountChip", () => {
  it("returns null when count is 0", () => {
    render(<CountChip count={0} />);
    expect(document.querySelector("span")).toBeNull();
  });

  it("renders the count when count > 0", () => {
    render(<CountChip count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders 99+ when count exceeds 99", () => {
    render(<CountChip count={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("applies muted tone by default", () => {
    const { container } = render(<CountChip count={3} />);
    const chip = container.querySelector("span");
    expect(chip?.className).toContain("bg-muted");
  });

  it("applies brand tone", () => {
    const { container } = render(<CountChip count={3} tone="brand" />);
    const chip = container.querySelector("span");
    expect(chip?.className).toContain("bg-brand-soft");
  });

  it("applies danger tone", () => {
    const { container } = render(<CountChip count={3} tone="danger" />);
    const chip = container.querySelector("span");
    expect(chip?.className).toContain("bg-danger");
  });
});
