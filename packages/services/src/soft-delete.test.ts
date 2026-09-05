/**
 * Unit tests for the pure soft-delete helpers.
 *
 *   hasPositiveStock     — check if any stock item has qty > 0
 *   isProjectDeletable   — check if project status allows deletion
 */
import { describe, it, expect } from "vitest";
import { hasPositiveStock, isProjectDeletable } from "./soft-delete";

describe("hasPositiveStock", () => {
  it("returns true when any item has positive qty", () => {
    expect(hasPositiveStock([{ qty: 0 }, { qty: 5 }, { qty: 0 }])).toBe(true);
  });

  it("returns false when all items have zero qty", () => {
    expect(hasPositiveStock([{ qty: 0 }, { qty: 0 }])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasPositiveStock([])).toBe(false);
  });

  it("returns true for single positive item", () => {
    expect(hasPositiveStock([{ qty: 1 }])).toBe(true);
  });

  it("returns false for single zero item", () => {
    expect(hasPositiveStock([{ qty: 0 }])).toBe(false);
  });

  it("handles negative quantities (treats as not positive)", () => {
    expect(hasPositiveStock([{ qty: -5 }])).toBe(false);
  });

  it("handles string quantities", () => {
    expect(hasPositiveStock([{ qty: "5" }])).toBe(true);
    expect(hasPositiveStock([{ qty: "0" }])).toBe(false);
  });

  it("handles mixed positive and negative", () => {
    expect(hasPositiveStock([{ qty: -5 }, { qty: 3 }])).toBe(true);
  });
});

describe("isProjectDeletable", () => {
  it("returns false for ACTIVE project", () => {
    expect(isProjectDeletable("ACTIVE")).toBe(false);
  });

  it("returns true for COMPLETED project", () => {
    expect(isProjectDeletable("COMPLETED")).toBe(true);
  });

  it("returns true for ON_HOLD project", () => {
    expect(isProjectDeletable("ON_HOLD")).toBe(true);
  });

  it("returns true for PLANNED project", () => {
    expect(isProjectDeletable("PLANNED")).toBe(true);
  });

  it("returns true for unknown status", () => {
    expect(isProjectDeletable("UNKNOWN")).toBe(true);
  });
});
