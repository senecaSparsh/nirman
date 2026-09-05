// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a div element", () => {
    render(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.tagName).toBe("DIV");
  });

  it("applies the skeleton base class", () => {
    render(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.className).toContain("skeleton");
    expect(el.className).toContain("rounded-md");
  });

  it("applies custom className", () => {
    render(<Skeleton className="h-8 w-48" data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.className).toContain("h-8");
    expect(el.className).toContain("w-48");
  });

  it("passes through additional props", () => {
    render(<Skeleton title="loading" data-testid="s" />);
    expect(screen.getByTestId("s")).toHaveAttribute("title", "loading");
  });
});
