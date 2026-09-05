// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { EmployeeName } from "./employee-name";

describe("EmployeeName", () => {
  it("renders the name as a span by default", () => {
    render(<EmployeeName id="emp-1" name="John Doe" />);
    const el = screen.getByText("John Doe");
    expect(el.tagName).toBe("SPAN");
  });

  it("renders as an anchor when asLink is true", () => {
    render(<EmployeeName id="emp-1" name="John Doe" asLink />);
    const el = screen.getByText("John Doe");
    expect(el.tagName).toBe("A");
  });

  it("sets data-emp-id attribute", () => {
    render(<EmployeeName id="emp-123" name="Jane" />);
    const el = screen.getByText("Jane");
    expect(el).toHaveAttribute("data-emp-id", "emp-123");
  });

  it("sets default title for double-click hint", () => {
    render(<EmployeeName id="emp-1" name="John" />);
    const el = screen.getByText("John");
    expect(el).toHaveAttribute("title", "Double-click to view profile");
  });

  it("allows overriding the title", () => {
    render(<EmployeeName id="emp-1" name="John" title="Click to view" />);
    const el = screen.getByText("John");
    expect(el).toHaveAttribute("title", "Click to view");
  });

  it("suppresses title when null is passed", () => {
    render(<EmployeeName id="emp-1" name="John" title={null} />);
    const el = screen.getByText("John");
    expect(el).not.toHaveAttribute("title");
  });

  it("renders as link with correct href", () => {
    render(<EmployeeName id="emp-5" name="Jane" asLink />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/hr/employees/emp-5");
  });

  it("applies custom className", () => {
    render(<EmployeeName id="emp-1" name="John" className="custom-class" />);
    const el = screen.getByText("John");
    expect(el.className).toContain("custom-class");
  });
});
