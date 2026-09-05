/**
 * Unit tests for CSV export utility.
 *
 *   toCSV — convert array of row objects to CSV string
 */
import { describe, it, expect } from "vitest";
import { toCSV } from "./export";

describe("toCSV", () => {
  it("returns header only for empty rows", () => {
    const csv = toCSV([], [{ key: "name", label: "Name" }, { key: "age", label: "Age" }]);
    expect(csv).toBe("Name,Age\n");
  });

  it("converts simple rows to CSV", () => {
    const csv = toCSV(
      [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }],
      [{ key: "name", label: "Name" }, { key: "age", label: "Age" }],
    );
    expect(csv).toBe("Name,Age\nAlice,30\nBob,25");
  });

  it("escapes cells containing commas", () => {
    const csv = toCSV(
      [{ name: "Smith, John", age: 30 }],
      [{ key: "name", label: "Name" }, { key: "age", label: "Age" }],
    );
    expect(csv).toContain('"Smith, John"');
  });

  it("escapes cells containing quotes by doubling them", () => {
    const csv = toCSV(
      [{ name: 'John "The Rock" Doe', age: 30 }],
      [{ key: "name", label: "Name" }],
    );
    expect(csv).toContain('"John ""The Rock"" Doe"');
  });

  it("escapes cells containing newlines", () => {
    const csv = toCSV(
      [{ name: "Line1\nLine2", age: 30 }],
      [{ key: "name", label: "Name" }],
    );
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("does not escape simple cells", () => {
    const csv = toCSV(
      [{ name: "Alice", age: 30 }],
      [{ key: "name", label: "Name" }],
    );
    expect(csv).toBe("Name\nAlice");
  });

  it("handles null values as empty strings", () => {
    const csv = toCSV(
      [{ name: null, age: 30 }],
      [{ key: "name", label: "Name" }, { key: "age", label: "Age" }],
    );
    expect(csv).toBe("Name,Age\n,30");
  });

  it("handles undefined values as empty strings", () => {
    const csv = toCSV(
      [{ name: undefined, age: 30 }],
      [{ key: "name", label: "Name" }, { key: "age", label: "Age" }],
    );
    expect(csv).toBe("Name,Age\n,30");
  });

  it("uses format function when provided", () => {
    const csv = toCSV(
      [{ price: 1000 }],
      [{ key: "price", label: "Price", format: (v) => `₹${v}` }],
    );
    expect(csv).toBe("Price\n₹1000");
  });

  it("supports nested property access with dotted keys", () => {
    const csv = toCSV(
      [{ customer: { name: "Acme Corp" } }],
      [{ key: "customer.name", label: "Customer" }],
    );
    expect(csv).toBe("Customer\nAcme Corp");
  });

  it("handles missing nested properties", () => {
    const csv = toCSV(
      [{ customer: { name: "Acme" } }],
      [{ key: "customer.phone", label: "Phone" }],
    );
    expect(csv).toBe("Phone\n");
  });

  it("handles boolean values", () => {
    const csv = toCSV(
      [{ active: true, verified: false }],
      [{ key: "active", label: "Active" }, { key: "verified", label: "Verified" }],
    );
    expect(csv).toBe("Active,Verified\ntrue,false");
  });
});
