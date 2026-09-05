/**
 * Unit tests for entity URL mapping.
 *
 *   entityUrl — maps entity type + ID to a clickable URL
 */
import { describe, it, expect } from "vitest";
import { entityUrl } from "./entity-url";

describe("entityUrl", () => {
  it("returns null for null entityType", () => {
    expect(entityUrl(null, "123")).toBeNull();
  });

  it("returns null for null entityId", () => {
    expect(entityUrl("PurchaseOrder", null)).toBeNull();
  });

  it("returns null for empty entityType", () => {
    expect(entityUrl("", "123")).toBeNull();
  });

  it("returns null for empty entityId", () => {
    expect(entityUrl("PurchaseOrder", "")).toBeNull();
  });

  it("maps PurchaseOrder with ID in query param", () => {
    expect(entityUrl("PurchaseOrder", "po-123")).toBe("/procurement?po=po-123");
  });

  it("maps Project with ID in path", () => {
    expect(entityUrl("Project", "proj-1")).toBe("/projects/proj-1");
  });

  it("maps Material to /materials", () => {
    expect(entityUrl("Material", "mat-1")).toBe("/materials");
  });

  it("maps Supplier to /procurement", () => {
    expect(entityUrl("Supplier", "sup-1")).toBe("/procurement");
  });

  it("maps SupplierPayment to /finance", () => {
    expect(entityUrl("SupplierPayment", "pay-1")).toBe("/finance");
  });

  it("maps LandPurchase to /land", () => {
    expect(entityUrl("LandPurchase", "lp-1")).toBe("/land");
  });

  it("maps BuiltUnit to /units", () => {
    expect(entityUrl("BuiltUnit", "bu-1")).toBe("/units");
  });

  it("maps Equipment to /equipment", () => {
    expect(entityUrl("Equipment", "eq-1")).toBe("/equipment");
  });

  it("maps Tenancy to /rentals", () => {
    expect(entityUrl("Tenancy", "tn-1")).toBe("/rentals");
  });

  it("maps WorkOrder to /work-orders", () => {
    expect(entityUrl("WorkOrder", "wo-1")).toBe("/work-orders");
  });

  it("returns null for unknown entity type", () => {
    expect(entityUrl("UnknownType", "123")).toBeNull();
  });
});
