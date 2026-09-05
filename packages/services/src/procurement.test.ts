/**
 * Unit tests for the pure procurement helper in procurement.ts.
 *
 *   haversineDistance — great-circle distance between two GPS points (in metres)
 *
 * Uses the Haversine formula with Earth radius = 6,371,000 m.
 * Result is rounded to the nearest metre.
 */
import { describe, it, expect } from "vitest";
import { haversineDistance } from "./procurement";

describe("haversineDistance", () => {
  it("returns 0 for the same point", () => {
    expect(haversineDistance(28.6139, 77.2090, 28.6139, 77.2090)).toBe(0);
  });

  it("computes distance between Delhi and Mumbai (~1150 km)", () => {
    // Delhi: 28.6139°N, 77.2090°E
    // Mumbai: 19.0760°N, 72.8777°E
    // Actual distance ~1150 km
    const dist = haversineDistance(28.6139, 77.2090, 19.0760, 72.8777);
    expect(dist).toBeGreaterThan(1100000); // > 1100 km
    expect(dist).toBeLessThan(1200000);   // < 1200 km
  });

  it("computes distance between nearby points (< 1 km)", () => {
    // Two points ~100m apart in Delhi
    const dist = haversineDistance(28.6139, 77.2090, 28.6148, 77.2090);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(200);
  });

  it("is symmetric (distance A→B = distance B→A)", () => {
    const d1 = haversineDistance(28.6139, 77.2090, 19.0760, 72.8777);
    const d2 = haversineDistance(19.0760, 72.8777, 28.6139, 77.2090);
    expect(d1).toBe(d2);
  });

  it("computes distance between Bangalore and Chennai (~290 km)", () => {
    // Bangalore: 12.9716°N, 77.5946°E
    // Chennai: 13.0827°N, 80.2707°E
    const dist = haversineDistance(12.9716, 77.5946, 13.0827, 80.2707);
    expect(dist).toBeGreaterThan(280000); // > 280 km
    expect(dist).toBeLessThan(310000);   // < 310 km
  });

  it("handles negative coordinates (southern/western hemisphere)", () => {
    // São Paulo: -23.5505, -46.6333
    // Buenos Aires: -34.6037, -58.3816
    // Actual distance ~1675 km
    const dist = haversineDistance(-23.5505, -46.6333, -34.6037, -58.3816);
    expect(dist).toBeGreaterThan(1600000); // > 1600 km
    expect(dist).toBeLessThan(1700000);   // < 1700 km
  });
});
