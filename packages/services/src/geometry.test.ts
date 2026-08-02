import { describe, it, expect } from "vitest";
import {
  polygonArea,
  signedArea,
  ensureCCW,
  segmentIntersection,
  pointInPolygon,
  centroid,
  splitConvexPolygon,
  rectangle,
  normalizePolygon,
  boundingBox,
  toSvgPath,
  areaRatios,
  type Polygon,
} from "./geometry";

describe("polygonArea (Shoelace)", () => {
  it("computes area of a unit square", () => {
    const sq: Polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(polygonArea(sq)).toBe(1);
  });

  it("computes area of a 2×3 rectangle", () => {
    const rect = rectangle(2, 3);
    expect(polygonArea(rect)).toBe(6);
  });

  it("computes area of a triangle", () => {
    const tri: Polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(polygonArea(tri)).toBe(6);
  });

  it("returns absolute area regardless of winding", () => {
    const cw: Polygon = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    const ccw: Polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(polygonArea(cw)).toBe(1);
    expect(polygonArea(ccw)).toBe(1);
  });
});

describe("signedArea + ensureCCW", () => {
  it("returns positive for CCW, negative for CW", () => {
    const ccw = rectangle(1, 1);
    const cw = [...ccw].reverse();
    expect(signedArea(ccw)).toBeGreaterThan(0);
    expect(signedArea(cw)).toBeLessThan(0);
  });

  it("ensureCCW reverses clockwise polygons", () => {
    const cw: Polygon = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    const fixed = ensureCCW(cw);
    expect(signedArea(fixed)).toBeGreaterThan(0);
  });

  it("ensureCCW leaves CCW polygons unchanged", () => {
    const ccw = rectangle(1, 1);
    const fixed = ensureCCW(ccw);
    expect(fixed).toEqual(ccw);
  });
});

describe("segmentIntersection", () => {
  it("finds crossing point of two segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 2, y: 2 } };
    const s2 = { a: { x: 0, y: 2 }, b: { x: 2, y: 0 } };
    const pt = segmentIntersection(s1, s2);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(1);
    expect(pt!.y).toBeCloseTo(1);
  });

  it("returns null for parallel segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } };
    const s2 = { a: { x: 0, y: 1 }, b: { x: 2, y: 1 } };
    expect(segmentIntersection(s1, s2)).toBeNull();
  });

  it("returns null for non-crossing segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
    const s2 = { a: { x: 5, y: 5 }, b: { x: 6, y: 6 } };
    expect(segmentIntersection(s1, s2)).toBeNull();
  });

  it("returns null for collinear segments", () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } };
    const s2 = { a: { x: 3, y: 0 }, b: { x: 5, y: 0 } };
    expect(segmentIntersection(s1, s2)).toBeNull();
  });
});

describe("pointInPolygon", () => {
  const sq: Polygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("returns true for interior points", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
  });

  it("returns false for exterior points", () => {
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, sq)).toBe(false);
  });
});

describe("centroid", () => {
  it("computes centroid of a square", () => {
    const sq = rectangle(2, 2);
    const c = centroid(sq);
    expect(c.x).toBeCloseTo(1);
    expect(c.y).toBeCloseTo(1);
  });

  it("computes centroid of a triangle", () => {
    const tri: Polygon = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ];
    const c = centroid(tri);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
  });
});

describe("splitConvexPolygon", () => {
  it("splits a rectangle vertically into two equal halves", () => {
    const rect = rectangle(2, 2);
    const line = { a: { x: 1, y: -1 }, b: { x: 1, y: 3 } };
    const result = splitConvexPolygon(rect, line);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(polygonArea(left)).toBeCloseTo(2);
    expect(polygonArea(right)).toBeCloseTo(2);
    // Total area conserved
    expect(polygonArea(left) + polygonArea(right)).toBeCloseTo(4);
  });

  it("splits a rectangle horizontally into unequal halves", () => {
    const rect = rectangle(3, 3);
    const line = { a: { x: -1, y: 1 }, b: { x: 4, y: 1 } };
    const result = splitConvexPolygon(rect, line);
    expect(result).not.toBeNull();
    const [top, bottom] = result!;
    // Bottom is 3×1=3, top is 3×2=6
    const areas = [polygonArea(top), polygonArea(bottom)].sort();
    expect(areas[0]).toBeCloseTo(3);
    expect(areas[1]).toBeCloseTo(6);
  });

  it("splits a rectangle diagonally into two triangles", () => {
    const rect = rectangle(2, 2);
    const line = { a: { x: 0, y: 0 }, b: { x: 2, y: 2 } };
    const result = splitConvexPolygon(rect, line);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(polygonArea(a)).toBeCloseTo(2);
    expect(polygonArea(b)).toBeCloseTo(2);
  });

  it("returns null when line doesn't cross the polygon", () => {
    const rect = rectangle(2, 2);
    const line = { a: { x: 5, y: 5 }, b: { x: 6, y: 6 } };
    expect(splitConvexPolygon(rect, line)).toBeNull();
  });

  it("returns null when line is entirely outside", () => {
    const rect = rectangle(2, 2);
    const line = { a: { x: -5, y: -5 }, b: { x: -4, y: -4 } };
    expect(splitConvexPolygon(rect, line)).toBeNull();
  });

  it("conserves area across multiple splits (chain)", () => {
    // Start with 10×10, split at x=5, then split the right half at y=5
    const rect = rectangle(10, 10);
    const cut1 = { a: { x: 5, y: -1 }, b: { x: 5, y: 11 } };
    const r1 = splitConvexPolygon(rect, cut1)!;
    const [left, right] = r1;
    expect(polygonArea(left) + polygonArea(right)).toBeCloseTo(100);

    // Split the right half horizontally (line must extend beyond polygon bounds)
    const cut2 = { a: { x: -1, y: 5 }, b: { x: 11, y: 5 } };
    const r2 = splitConvexPolygon(right, cut2)!;
    const [topRight, bottomRight] = r2;
    const totalArea =
      polygonArea(left) + polygonArea(topRight) + polygonArea(bottomRight);
    expect(totalArea).toBeCloseTo(100);
  });
});

describe("normalizePolygon + boundingBox", () => {
  it("normalizes a polygon to [0,1] coordinates", () => {
    const poly: Polygon = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ];
    const norm = normalizePolygon(poly);
    const bb = boundingBox(norm);
    expect(bb.minX).toBeCloseTo(0);
    expect(bb.minY).toBeCloseTo(0);
    expect(bb.maxX).toBeCloseTo(1);
    expect(bb.maxY).toBeCloseTo(1);
  });

  it("preserves area ratios after normalization", () => {
    const poly = rectangle(100, 50);
    const norm = normalizePolygon(poly);
    expect(polygonArea(poly)).toBeCloseTo(5000);
    expect(polygonArea(norm)).toBeCloseTo(1); // 1×0.5 = 0.5... actually 1×0.5
  });
});

describe("toSvgPath", () => {
  it("generates a valid SVG path string", () => {
    const sq = rectangle(1, 1);
    const path = toSvgPath(sq, 100, 100);
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
    expect(path).toContain("0.00,0.00");
    expect(path).toContain("100.00,0.00");
    expect(path).toContain("100.00,100.00");
    expect(path).toContain("0.00,100.00");
  });
});

describe("areaRatios", () => {
  it("computes proportional ratios", () => {
    const ratios = areaRatios(100, [30, 70]);
    expect(ratios[0]).toBeCloseTo(0.3);
    expect(ratios[1]).toBeCloseTo(0.7);
  });

  it("ratios sum to 1", () => {
    const ratios = areaRatios(1000, [250, 350, 400]);
    const sum = ratios.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });
});
