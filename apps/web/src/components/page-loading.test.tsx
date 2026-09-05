// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { PageLoading } from "./page-loading";

describe("PageLoading", () => {
  it("renders default variant with label", () => {
    render(<PageLoading label="Loading data…" />);
    expect(screen.getByText("Loading data…")).toBeInTheDocument();
  });

  it("renders default label when not specified", () => {
    render(<PageLoading />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders list variant with skeleton rows", () => {
    const { container } = render(<PageLoading variant="list" />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders cards variant with skeleton cards", () => {
    const { container } = render(<PageLoading variant="cards" />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders board variant with skeleton columns", () => {
    const { container } = render(<PageLoading variant="board" />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("applies custom className", () => {
    const { container } = render(<PageLoading className="my-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("my-class");
  });

  it("renders animate-pulse on label in default variant", () => {
    const { container } = render(<PageLoading label="Loading…" />);
    const pulse = container.querySelector(".animate-pulse");
    expect(pulse).not.toBeNull();
    expect(pulse?.textContent).toBe("Loading…");
  });
});
