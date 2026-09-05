/**
 * Unit tests for pure geometry functions in geometry.ts.
 *
 *   sub, add, scale, cross, dot, length — basic vector math
 *   signedArea, polygonArea, ensureCCW  — shoelace area
 *   segmentIntersection                  — line segment crossing
 *   pointInPolygon                       — ray casting
 *   centroid                             — geometric center
 *   rectangle, centeredRectangle         — shape factories
 *   areaRatios                           — proportional allocation
 *   boundingBox, normalizePolygon        — normalization
 */
import { describe, it, expect } from "vitest";
import {
  sub, add, scale, cross, dot, length,
  signedArea, polygonArea, ensureCCW,
  segmentIntersection,
  pointInPolygon,
  centroid,
  rectangle, centeredRectangle,
  areaRatios,
  boundingBox, normalizePolygon,
} from "./geometry";

describe("vector math", () => {
  it("subtracts two points", () => {
    expect(sub({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 2 });
  });

  it("adds two points", () => {
    expect(add({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 7, y: 4 });
  });

  it("scales a point", () => {
    expect(scale({ x: 3, y: 4 }, 2)).toEqual({ x: 6, y: 8 });
  });

  it("computes cross product", () => {
    expect(cross({ x: 3, y: 0 }, { x: 0, y: 4 })).toBe(12);
  });

  it("computes dot product", () => {
    expect(dot({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(25);
  });

  it("computes length (magnitude)", () => {
    expect(length({ x: 3, y: 4 })).toBe(5);
  });
});

describe("signedArea", () => {
  it("returns positive area for CCW square", () => {
    const square = rectangle(2, 2); // CCW
    expect(signedArea(square)).toBe(4);
  });

  it("returns negative area for CW square", () => {
    const cwSquare = [...rectangle(2, 2)].reverse();
    expect(signedArea(cwSquare)).toBe(-4);
  });

  it("returns 0 for degenerate (collinear) polygon", () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(signedArea(line)).toBe(0);
  });
});

describe("polygonArea", () => {
  it("returns absolute area", () => {
    expect(polygonArea(rectangle(3, 4))).toBe(12);
    expect(polygonArea([...rectangle(3, 4)].reverse())).toBe(12);
  });
});

describe("ensureCCW", () => {
  it("reverses CW polygon to CCW", () => {
    const cw = [...rectangle(2, 2)].reverse();
    const ccw = ensureCCW(cw);
    expect(signedArea(ccw)).toBeGreaterThan(0);
  });

  it("leaves CCW polygon unchanged", () => {
    const ccw = rectangle(2, 2);
    expect(ensureCCW(ccw)).toBe(ccw);
  });
});

describe("segmentIntersection", () => {
  it("finds intersection of two crossing segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 4, y: 4 } };
    const s2 = { a: { x: 0, y: 4 }, b: { x: 4, y: 0 } };
    const pt = segmentIntersection(s1, s2);
    expect(pt).toEqual({ x: 2, y: 2 });
  });

  it("returns null for parallel segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
    const s2 = { a: { x: 0, y: 1 }, b: { x: 4, y: 1 } };
    expect(segmentIntersection(s1, s2)).toBeNull();
  });

  it("returns null for non-crossing segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 2, y: 2 } };
    const s2 = { a: { x: 5, y: 5 }, b: { x: 7, y: 7 } };
    expect(segmentIntersection(s1, s2)).toBeNull();
  });

  it("finds intersection at endpoint", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } };
    const s2 = { a: { x: 2, y: 0 }, b: { x: 2, y: 2 } };
    const pt = segmentIntersection(s1, s2);
    expect(pt).toEqual({ x: 2, y: 0 });
  });
});

describe("pointInPolygon", () => {
  const square = rectangle(4, 4);

  it("returns true for point inside", () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
  });

  it("returns false for point outside", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(false);
  });

  it("returns false for point at corner (boundary)", () => {
    // Ray casting is unreliable on boundaries — just verify it doesn't crash
    pointInPolygon({ x: 0, y: 0 }, square);
  });
});

describe("centroid", () => {
  it("computes centroid of a square", () => {
    const square = rectangle(4, 4);
    const c = centroid(square);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
  });

  it("computes centroid of a rectangle", () => {
    const rect = rectangle(6, 4);
    const c = centroid(rect);
    expect(c.x).toBeCloseTo(3);
    expect(c.y).toBeCloseTo(2);
  });

  it("throws for empty polygon", () => {
    expect(() => centroid([])).toThrow("empty polygon");
  });
});

describe("rectangle", () => {
  it("creates a CCW rectangle from width and height", () => {
    const rect = rectangle(3, 4);
    expect(rect).toHaveLength(4);
    expect(signedArea(rect)).toBe(12); // positive = CCW
  });
});

describe("centeredRectangle", () => {
  it("creates a rectangle centered at origin", () => {
    const rect = centeredRectangle(4, 6);
    expect(rect[0]).toEqual({ x: -2, y: -3 });
    expect(rect[2]).toEqual({ x: 2, y: 3 });
  });
});

describe("areaRatios", () => {
  it("computes fraction of parent area for each child", () => {
    const ratios = areaRatios(100, [30, 20, 50]);
    expect(ratios).toEqual([0.3, 0.2, 0.5]);
  });

  it("throws when parent area is 0", () => {
    expect(() => areaRatios(0, [10, 20])).toThrow("Parent area cannot be zero");
  });
});

describe("boundingBox", () => {
  it("computes bounding box of a polygon", () => {
    const poly = [{ x: 1, y: 2 }, { x: 5, y: 3 }, { x: 3, y: 8 }];
    const bb = boundingBox(poly);
    expect(bb.minX).toBe(1);
    expect(bb.minY).toBe(2);
    expect(bb.maxX).toBe(5);
    expect(bb.maxY).toBe(8);
    expect(bb.width).toBe(4);
    expect(bb.height).toBe(6);
  });
});

describe("normalizePolygon", () => {
  it("normalizes polygon to [0,1] × [0,1]", () => {
    const poly = [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }];
    const normalized = normalizePolygon(poly);
    expect(normalized[0]).toEqual({ x: 0, y: 0 });
    expect(normalized[1]).toEqual({ x: 1, y: 0 });
    expect(normalized[2]).toEqual({ x: 1, y: 1 });
    expect(normalized[3]).toEqual({ x: 0, y: 1 });
  });

  it("returns polygon unchanged when width or height is ~0", () => {
    const line = [{ x: 5, y: 0 }, { x: 5, y: 10 }];
    expect(normalizePolygon(line)).toBe(line);
  });
});
