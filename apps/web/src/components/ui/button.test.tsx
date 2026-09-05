// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { Button, ButtonGroup } from "./button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    const { user } = render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ["default"],
    ["brand"],
    ["destructive"],
    ["success"],
    ["outline"],
    ["secondary"],
    ["ghost"],
    ["link"],
  ] as const)("renders variant %s without crashing", (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    expect(screen.getByRole("button", { name: variant })).toBeInTheDocument();
  });

  it.each(["sm", "default", "xs", "lg", "touch", "icon", "icon-sm", "icon-xs", "icon-touch"] as const)(
    "renders size %s without crashing",
    (size) => {
      render(<Button size={size}>S</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    },
  );

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("is disabled when loading prop is true", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button", { name: "Loading" })).toBeDisabled();
  });

  it("renders a spinner when loading", () => {
    const { container } = render(<Button loading>Loading</Button>);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    const { user } = render(<Button disabled onClick={onClick}>No click</Button>);
    await user.click(screen.getByRole("button", { name: "No click" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire onClick when loading", async () => {
    const onClick = vi.fn();
    const { user } = render(<Button loading onClick={onClick}>No click</Button>);
    await user.click(screen.getByRole("button", { name: "No click" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as a child element when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Link button" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });

  it("passes through additional button attributes", () => {
    render(<Button data-testid="btn" title="tip">T</Button>);
    const btn = screen.getByTestId("btn");
    expect(btn).toHaveAttribute("title", "tip");
  });
});

describe("ButtonGroup", () => {
  it("renders children buttons", () => {
    render(
      <ButtonGroup>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });
});
