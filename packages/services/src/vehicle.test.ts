/**
 * Unit tests for the exported constants in vehicle.ts.
 *
 * `VEHICLE_TYPES` is the canonical list of vehicle types.
 * `VEHICLE_TYPE_LABELS` maps each type to a human-readable label.
 *
 * No DB, no mocking — pure constants.
 */
import { describe, it, expect } from "vitest";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "./vehicle";

describe("VEHICLE_TYPES", () => {
  it("contains 12 vehicle types", () => {
    expect(VEHICLE_TYPES).toHaveLength(12);
  });

  it("includes common construction transport types", () => {
    expect(VEHICLE_TYPES).toContain("TRUCK");
    expect(VEHICLE_TYPES).toContain("TEMPO");
    expect(VEHICLE_TYPES).toContain("PICKUP");
    expect(VEHICLE_TYPES).toContain("TRACTOR");
  });

  it("includes small/last-mile types", () => {
    expect(VEHICLE_TYPES).toContain("AUTO");
    expect(VEHICLE_TYPES).toContain("BIKE");
    expect(VEHICLE_TYPES).toContain("CYCLE");
  });

  it("includes manual transport types", () => {
    expect(VEHICLE_TYPES).toContain("HAND_CART");
    expect(VEHICLE_TYPES).toContain("PORTER");
  });

  it("includes OTHER as a catch-all", () => {
    expect(VEHICLE_TYPES).toContain("OTHER");
  });
});

describe("VEHICLE_TYPE_LABELS", () => {
  it("has a label for every vehicle type", () => {
    for (const type of VEHICLE_TYPES) {
      expect(VEHICLE_TYPE_LABELS[type]!).toBeDefined();
      expect(typeof VEHICLE_TYPE_LABELS[type]!).toBe("string");
      expect(VEHICLE_TYPE_LABELS[type]!.length).toBeGreaterThan(0);
    }
  });

  it("provides human-readable labels", () => {
    expect(VEHICLE_TYPE_LABELS.TRUCK).toContain("Truck");
    expect(VEHICLE_TYPE_LABELS.TEMPO).toBe("Tempo");
    expect(VEHICLE_TYPE_LABELS.PICKUP).toBe("Pickup");
  });

  it("does not have labels for non-existent types", () => {
    expect(VEHICLE_TYPE_LABELS["NONEXISTENT"]).toBeUndefined();
  });
});
