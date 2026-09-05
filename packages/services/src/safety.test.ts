/**
 * Unit tests for the pure helper `computeRiskLevel()` in safety.ts.
 *
 * Computes a hazard risk level from likelihood (1-5) × severity (1-5):
 *   score >= 20 → CRITICAL
 *   score >= 12 → HIGH
 *   score >= 6  → MEDIUM
 *   score < 6   → LOW
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { computeRiskLevel } from "./safety";

describe("computeRiskLevel", () => {
  it("returns LOW for score < 6", () => {
    expect(computeRiskLevel(1, 1)).toBe("LOW"); // score 1
    expect(computeRiskLevel(1, 5)).toBe("LOW"); // score 5
    expect(computeRiskLevel(2, 2)).toBe("LOW"); // score 4
  });

  it("returns MEDIUM for score 6-11", () => {
    expect(computeRiskLevel(2, 3)).toBe("MEDIUM"); // score 6
    expect(computeRiskLevel(3, 3)).toBe("MEDIUM"); // score 9
    expect(computeRiskLevel(1, 11)).toBe("MEDIUM"); // score 11
  });

  it("returns HIGH for score 12-19", () => {
    expect(computeRiskLevel(3, 4)).toBe("HIGH"); // score 12
    expect(computeRiskLevel(4, 4)).toBe("HIGH"); // score 16
    expect(computeRiskLevel(1, 19)).toBe("HIGH"); // score 19
  });

  it("returns CRITICAL for score >= 20", () => {
    expect(computeRiskLevel(4, 5)).toBe("CRITICAL"); // score 20
    expect(computeRiskLevel(5, 5)).toBe("CRITICAL"); // score 25
    expect(computeRiskLevel(5, 10)).toBe("CRITICAL"); // score 50
  });

  it("boundary: score 5 is LOW, score 6 is MEDIUM", () => {
    expect(computeRiskLevel(1, 5)).toBe("LOW");
    expect(computeRiskLevel(2, 3)).toBe("MEDIUM");
  });

  it("boundary: score 11 is MEDIUM, score 12 is HIGH", () => {
    expect(computeRiskLevel(1, 11)).toBe("MEDIUM");
    expect(computeRiskLevel(3, 4)).toBe("HIGH");
  });

  it("boundary: score 19 is HIGH, score 20 is CRITICAL", () => {
    expect(computeRiskLevel(1, 19)).toBe("HIGH");
    expect(computeRiskLevel(4, 5)).toBe("CRITICAL");
  });
});
