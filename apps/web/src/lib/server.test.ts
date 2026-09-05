/**
 * Unit tests for server.ts pure helpers.
 *
 *   toNum — convert Prisma Decimal/string/null to JS number
 *
 *   Also tests key Zod schemas for form validation:
 *     materialCategorySchema, materialSchema, supplierSchema
 */
import { describe, it, expect } from "vitest";
import {
  toNum,
  materialCategorySchema,
  materialSchema,
  supplierSchema,
  projectTypeSchema,
  projectStatusSchema,
} from "./server";

describe("toNum", () => {
  it("returns 0 for null", () => {
    expect(toNum(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(toNum(undefined)).toBe(0);
  });

  it("returns the number for number input", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(3.14)).toBe(3.14);
    expect(toNum(0)).toBe(0);
    expect(toNum(-5)).toBe(-5);
  });

  it("converts string to number", () => {
    expect(toNum("42")).toBe(42);
    expect(toNum("3.14")).toBe(3.14);
  });

  it("returns 0 for non-numeric string", () => {
    expect(toNum("abc")).toBe(0);
    expect(toNum("")).toBe(0);
  });

  it("handles Prisma Decimal objects (via String conversion)", () => {
    // Prisma Decimal objects have a toString that returns the number string
    const decimalLike = { toString: () => "99.99" };
    expect(toNum(decimalLike)).toBe(99.99);
  });

  it("handles empty string", () => {
    expect(toNum("")).toBe(0);
  });

  it("handles NaN", () => {
    expect(toNum(NaN)).toBe(NaN); // typeof number, returns NaN
  });

  it("handles Infinity", () => {
    expect(toNum(Infinity)).toBe(Infinity);
  });

  it("handles very large numbers", () => {
    expect(toNum("999999999999.99")).toBe(999999999999.99);
  });
});

describe("materialCategorySchema", () => {
  it("validates a correct category", () => {
    const result = materialCategorySchema.safeParse({
      name: "Cement",
      unit: "BAG",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = materialCategorySchema.safeParse({
      name: "",
      unit: "BAG",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name > 80 chars", () => {
    const result = materialCategorySchema.safeParse({
      name: "A".repeat(81),
      unit: "BAG",
    });
    expect(result.success).toBe(false);
  });

  it("defaults unit to NOS", () => {
    const result = materialCategorySchema.safeParse({
      name: "Test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBe("NOS");
    }
  });

  it("accepts valid class values", () => {
    for (const cls of ["RAW_MATERIAL", "CONSUMABLE", "MRO", "TEMPORARY"]) {
      const result = materialCategorySchema.safeParse({
        name: "Test",
        unit: "BAG",
        class: cls,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid class value", () => {
    const result = materialCategorySchema.safeParse({
      name: "Test",
      unit: "BAG",
      class: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});

describe("materialSchema", () => {
  it("validates a correct material", () => {
    const result = materialSchema.safeParse({
      code: "CEM-001",
      name: "Cement OPC 53",
      categoryId: "cat-1",
      unit: "BAG",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty code", () => {
    const result = materialSchema.safeParse({
      code: "",
      name: "Cement",
      categoryId: "cat-1",
      unit: "BAG",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = materialSchema.safeParse({
      code: "CEM-001",
      name: "",
      categoryId: "cat-1",
      unit: "BAG",
    });
    expect(result.success).toBe(false);
  });
});

describe("supplierSchema", () => {
  it("validates a correct supplier", () => {
    const result = supplierSchema.safeParse({
      name: "ABC Suppliers",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = supplierSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("projectTypeSchema", () => {
  it("accepts valid project types", () => {
    // projectTypeSchema is a z.enum — check it has values
    const values = projectTypeSchema.options;
    expect(values.length).toBeGreaterThan(0);
  });
});

describe("projectStatusSchema", () => {
  it("accepts valid project statuses", () => {
    const values = projectStatusSchema.options;
    expect(values.length).toBeGreaterThan(0);
  });
});
