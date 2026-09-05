// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea data-testid="ta" />);
    const ta = screen.getByTestId("ta");
    expect(ta.tagName).toBe("TEXTAREA");
  });

  it("renders with placeholder", () => {
    render(<Textarea placeholder="Enter notes" />);
    expect(screen.getByPlaceholderText("Enter notes")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Textarea disabled data-testid="ta" />);
    expect(screen.getByTestId("ta")).toBeDisabled();
  });

  it("fires onChange when typed into", async () => {
    const onChange = vi.fn();
    const { user } = render(<Textarea onChange={onChange} data-testid="ta" />);
    await user.type(screen.getByTestId("ta"), "hello");
    expect(onChange).toHaveBeenCalled();
  });

  it("passes through value", () => {
    render(<Textarea value="test content" readOnly data-testid="ta" />);
    expect(screen.getByTestId("ta")).toHaveValue("test content");
  });

  it("supports rows attribute", () => {
    render(<Textarea rows={5} data-testid="ta" />);
    expect(screen.getByTestId("ta")).toHaveAttribute("rows", "5");
  });
});
