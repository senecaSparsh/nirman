/**
 * Unit tests for the pure template renderer in notifications.ts.
 *
 *   renderTemplate — replace {{variables}} in a template string
 */
import { describe, it, expect } from "vitest";
import { renderTemplate } from "./notifications";

describe("renderTemplate", () => {
  it("replaces a single variable", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("replaces multiple variables", () => {
    expect(
      renderTemplate("{{greeting}} {{name}}, your order #{{orderId}} is ready", {
        greeting: "Hi",
        name: "John",
        orderId: 12345,
      }),
    ).toBe("Hi John, your order #12345 is ready");
  });

  it("leaves unmatched variables as {{key}}", () => {
    expect(renderTemplate("Hello {{name}} from {{city}}", { name: "John" })).toBe(
      "Hello John from {{city}}",
    );
  });

  it("handles numeric values", () => {
    expect(renderTemplate("Total: ₹{{amount}}", { amount: 50000 })).toBe("Total: ₹50000");
  });

  it("handles undefined values (leaves as {{key}})", () => {
    expect(renderTemplate("Hello {{name}}", { name: undefined })).toBe("Hello {{name}}");
  });

  it("returns template unchanged when no variables", () => {
    expect(renderTemplate("No variables here", {})).toBe("No variables here");
  });

  it("handles empty template", () => {
    expect(renderTemplate("", { name: "John" })).toBe("");
  });

  it("handles repeated variables", () => {
    expect(renderTemplate("{{x}} + {{x}} = {{result}}", { x: 2, result: 4 })).toBe(
      "2 + 2 = 4",
    );
  });

  it("handles variables with underscores", () => {
    expect(renderTemplate("{{user_name}} from {{company_name}}", {
      user_name: "Alice",
      company_name: "Acme",
    })).toBe("Alice from Acme");
  });
});
