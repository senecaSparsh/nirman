/**
 * Unit tests for form validation utilities.
 *
 *   required       — non-empty check
 *   min / max      — numeric range checks
 *   positiveNumber — must be > 0
 *   email          — email format
 *   phone          — phone format
 *   gstin          — GSTIN format
 *   validateForm   — apply rules to a form object
 */
import { describe, it, expect } from "vitest";
import {
  required,
  min,
  max,
  positiveNumber,
  email,
  phone,
  gstin,
  validateForm,
} from "./validate";

describe("required", () => {
  it("returns error for empty string", () => {
    expect(required("", "Name")).toBe("Name is required");
  });

  it("returns error for null", () => {
    expect(required(null, "Name")).toBe("Name is required");
  });

  it("returns error for undefined", () => {
    expect(required(undefined, "Name")).toBe("Name is required");
  });

  it("returns error for NaN number", () => {
    expect(required(NaN, "Amount")).toBe("Amount is required");
  });

  it("returns undefined for valid string", () => {
    expect(required("hello", "Name")).toBeUndefined();
  });

  it("returns undefined for valid number", () => {
    expect(required(42, "Amount")).toBeUndefined();
  });

  it("returns undefined for 0 (0 is a valid number)", () => {
    expect(required(0, "Amount")).toBeUndefined();
  });
});

describe("min", () => {
  it("returns error when value < min", () => {
    expect(min(5, 10, "Qty")).toBe("Qty must be at least 10");
  });

  it("returns undefined when value = min", () => {
    expect(min(10, 10, "Qty")).toBeUndefined();
  });

  it("returns undefined when value > min", () => {
    expect(min(15, 10, "Qty")).toBeUndefined();
  });
});

describe("max", () => {
  it("returns error when value > max", () => {
    expect(max(15, 10, "Qty")).toBe("Qty must be at most 10");
  });

  it("returns undefined when value = max", () => {
    expect(max(10, 10, "Qty")).toBeUndefined();
  });

  it("returns undefined when value < max", () => {
    expect(max(5, 10, "Qty")).toBeUndefined();
  });
});

describe("positiveNumber", () => {
  it("returns error for 0", () => {
    expect(positiveNumber(0, "Amount")).toBe("Amount must be a positive number");
  });

  it("returns error for negative", () => {
    expect(positiveNumber(-5, "Amount")).toBe("Amount must be a positive number");
  });

  it("returns error for NaN", () => {
    expect(positiveNumber(NaN, "Amount")).toBe("Amount must be a positive number");
  });

  it("returns error for string that is not a number", () => {
    expect(positiveNumber("abc", "Amount")).toBe("Amount must be a positive number");
  });

  it("returns undefined for positive number", () => {
    expect(positiveNumber(42, "Amount")).toBeUndefined();
  });

  it("returns undefined for positive string number", () => {
    expect(positiveNumber("42", "Amount")).toBeUndefined();
  });

  it("returns error for string '0'", () => {
    expect(positiveNumber("0", "Amount")).toBe("Amount must be a positive number");
  });
});

describe("email", () => {
  it("returns undefined for empty string (optional)", () => {
    expect(email("")).toBeUndefined();
  });

  it("returns undefined for valid email", () => {
    expect(email("user@example.com")).toBeUndefined();
  });

  it("returns error for email without @", () => {
    expect(email("userexample.com")).toBe("Invalid email address");
  });

  it("returns error for email without domain", () => {
    expect(email("user@")).toBe("Invalid email address");
  });

  it("returns error for email without TLD", () => {
    expect(email("user@example")).toBe("Invalid email address");
  });

  it("returns error for email with spaces", () => {
    expect(email("user @example.com")).toBe("Invalid email address");
  });
});

describe("phone", () => {
  it("returns undefined for empty string (optional)", () => {
    expect(phone("")).toBeUndefined();
  });

  it("returns undefined for valid 10-digit phone", () => {
    expect(phone("9876543210")).toBeUndefined();
  });

  it("returns undefined for phone with +91 prefix", () => {
    expect(phone("+919876543210")).toBeUndefined();
  });

  it("returns undefined for phone with spaces and dashes", () => {
    expect(phone("+91 98765-43210")).toBeUndefined();
  });

  it("returns error for too-short phone", () => {
    expect(phone("12345")).toBe("Invalid phone number");
  });

  it("returns error for too-long phone", () => {
    expect(phone("1234567890123456")).toBe("Invalid phone number");
  });
});

describe("gstin", () => {
  it("returns undefined for empty string (optional)", () => {
    expect(gstin("")).toBeUndefined();
  });

  it("returns undefined for valid GSTIN", () => {
    // Format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
    expect(gstin("27ABCDE1234F1Z5")).toBeUndefined();
  });

  it("returns error for GSTIN with wrong length", () => {
    expect(gstin("27ABCDE1234F1Z")).toBe("Invalid GSTIN format");
  });

  it("returns error for GSTIN with wrong format (no Z at position 13)", () => {
    expect(gstin("27ABCDE1234F1A5")).toBe("Invalid GSTIN format");
  });

  it("returns error for GSTIN starting with letters", () => {
    expect(gstin("AAABCDE1234F1Z5")).toBe("Invalid GSTIN format");
  });
});

describe("validateForm", () => {
  it("returns errors for invalid fields", () => {
    const errors = validateForm(
      { name: "", age: 15 },
      {
        name: (v) => required(v as string, "Name"),
        age: (v) => min(v as number, 18, "Age"),
      },
    );
    expect(errors.name).toBe("Name is required");
    expect(errors.age).toBe("Age must be at least 18");
  });

  it("returns empty object when all fields valid", () => {
    const errors = validateForm(
      { name: "John", age: 25 },
      {
        name: (v) => required(v as string, "Name"),
        age: (v) => min(v as number, 18, "Age"),
      },
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("only runs rules that are provided", () => {
    const errors = validateForm(
      { name: "", age: 25 },
      {
        name: (v) => required(v as string, "Name"),
      },
    );
    expect(errors.name).toBe("Name is required");
    expect(errors.age).toBeUndefined();
  });

  it("returns empty object for empty rules", () => {
    const errors = validateForm({ name: "" }, {});
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
