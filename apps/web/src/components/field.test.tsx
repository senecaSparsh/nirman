// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { Field } from "./field";

describe("Field", () => {
  it("renders label and children", () => {
    render(
      <Field label="Username">
        <input data-testid="i" />
      </Field>,
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByTestId("i")).toBeInTheDocument();
  });

  it("renders required marker when required is true", () => {
    render(
      <Field label="Name" required>
        <input />
      </Field>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders hint text when provided and no error", () => {
    render(
      <Field label="Name" hint="Your full name">
        <input />
      </Field>,
    );
    expect(screen.getByText("Your full name")).toBeInTheDocument();
  });

  it("renders error message when error is provided", () => {
    render(
      <Field label="Name" error="This field is required">
        <input />
      </Field>,
    );
    expect(screen.getByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("This field is required")).toHaveAttribute("role", "alert");
  });

  it("shows error but not hint when both are provided", () => {
    render(
      <Field label="Name" error="Error!" hint="Hint text">
        <input />
      </Field>,
    );
    expect(screen.getByText("Error!")).toBeInTheDocument();
    expect(screen.queryByText("Hint text")).not.toBeInTheDocument();
  });

  it("applies danger class to label when error is present", () => {
    const { container } = render(
      <Field label="Name" error="Error">
        <input />
      </Field>,
    );
    const label = container.querySelector("label");
    expect(label?.className).toContain("text-danger");
  });
});
