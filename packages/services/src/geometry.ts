/**
 * Partition Geometry — pure polygon functions for the CAD/GIS partition canvas.
 *
 * All functions are framework-agnostic and side-effect-free so they can be
 * unit-tested in isolation. The canvas component calls these to compute areas,
 * split parcels along cut lines, and validate that children tile the parent.
 *
 * Coordinate system: normalized [0,1] × [0,1] relative to the parcel's bounding
 * box. This makes geometry resolution-independent — the canvas scales to any
 * display size, and the stored geometry is portable across screen resolutions.
 */

export interface Point {
  x: number;
  y: number;
}

export type Polygon = Point[];

/** A line segment defined by two endpoints. */
export interface Segment {
  a: Point;
  b: Point;
}

const EPS = 1e-9;

// ── Basic vector math ───────────────────────────────────────────

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function length(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

// ── Shoelace area ───────────────────────────────────────────────

/**
 * Signed area of a polygon using the Shoelace formula.
 * Positive for counter-clockwise winding, negative for clockwise.
 */
export function signedArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    sum += poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
  }
  return sum / 2;
}

/** Absolute area of a polygon. */
export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

/** Ensure a polygon is wound counter-clockwise (positive signed area). */
export function ensureCCW(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

// ── Line segment intersection ───────────────────────────────────

/**
 * Compute the intersection point of two line segments, or null if they don't
 * cross. Uses parametric form: P = a + t(b−a), Q = c + u(d−c).
 * Intersection exists iff 0 ≤ t ≤ 1 and 0 ≤ u ≤ 1.
 */
export function segmentIntersection(
  s1: Segment,
  s2: Segment,
): Point | null {
  const r = sub(s1.b, s1.a); // direction of s1
  const s = sub(s2.b, s2.a); // direction of s2
  const rxs = cross(r, s);
  // Parallel → no intersection (or collinear, which we don't handle here)
  if (Math.abs(rxs) < EPS) return null;
  const qp = sub(s2.a, s1.a);
  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return add(s1.a, scale(r, t));
}

// ── Point in polygon (ray casting) ──────────────────────────────

/** True if point p is inside the polygon (ray casting algorithm). */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y;
    const xj = poly[j]!.x, yj = poly[j]!.y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Polygon centroid ────────────────────────────────────────────

/** Centroid (geometric center) of a polygon. */
export function centroid(poly: Polygon): Point {
  if (poly.length === 0) throw new Error("Cannot compute centroid of empty polygon");
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const cross2 = poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
    cx += (poly[i]!.x + poly[j]!.x) * cross2;
    cy += (poly[i]!.y + poly[j]!.y) * cross2;
    a += cross2;
  }
  a *= 0.5;
  if (Math.abs(a) < EPS) {
    // Degenerate — return average of vertices
    const avg = poly.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    );
    return { x: avg.x / poly.length, y: avg.y / poly.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// ── Split a convex polygon by a line ────────────────────────────

/**
 * Split a CONVEX polygon by a line segment into two polygons.
 * The line must cross the polygon (enter one edge, exit another).
 * Returns [left, right] — the two halves — or null if the line doesn't
 * fully cross the polygon.
 *
 * For convex polygons (which land parcels always are in practice), this is
 * exact: the line enters one edge and exits another, creating two convex
 * children whose areas sum to the parent's area.
 */
export function splitConvexPolygon(
  poly: Polygon,
  line: Segment,
): [Polygon, Polygon] | null {
  const ccw = ensureCCW(poly);

  // Find ALL edge intersections of the line with the polygon.
  // A convex polygon crossed by a line has exactly 2 intersection points.
  // When the line passes through a vertex, it touches two edges at the same
  // point — deduplicate by point proximity so we get exactly 2 distinct points.
  const raw: { point: Point; edgeIndex: number; t: number }[] = [];
  for (let i = 0; i < ccw.length; i++) {
    const j = (i + 1) % ccw.length;
    const edge: Segment = { a: ccw[i]!, b: ccw[j]! };
    const pt = segmentIntersection(edge, line);
    if (pt) {
      // Parameterize along the line to order entry vs exit
      const dx = line.b.x - line.a.x;
      const dy = line.b.y - line.a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > EPS ? ((pt.x - line.a.x) * dx + (pt.y - line.a.y) * dy) / lenSq : 0;
      raw.push({ point: pt, edgeIndex: i, t });
    }
  }

  if (raw.length < 2) return null;

  // Sort by position along the line
  raw.sort((a, b) => a.t - b.t);

  // Deduplicate: merge intersections at the same point (within EPS).
  // Keep the first edge index at each unique point.
  const intersections: typeof raw = [];
  for (const item of raw) {
    const last = intersections[intersections.length - 1];
    if (last && Math.abs(item.t - last.t) < 1e-6) {
      // Same point — skip duplicate (line passes through a vertex)
      continue;
    }
    intersections.push(item);
  }

  if (intersections.length < 2) return null;

  const entry = intersections[0]!;
  const exit = intersections[1]!;

  // Build left polygon: entry → walk CCW vertices → exit → close.
  // Skip vertices that coincide with entry/exit points (happens when the line
  // passes through a corner — the vertex is already represented by the
  // intersection point, so including both creates a degenerate edge).
  const ptEq = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

  const left: Polygon = [entry.point];
  let i = entry.edgeIndex;
  while (i !== exit.edgeIndex) {
    i = (i + 1) % ccw.length;
    const v = ccw[i]!;
    if (!ptEq(v, entry.point) && !ptEq(v, exit.point)) left.push(v);
  }
  if (!ptEq(exit.point, left[left.length - 1]!)) left.push(exit.point);

  // Build right polygon: exit → walk CCW vertices → entry → close
  const right: Polygon = [exit.point];
  i = exit.edgeIndex;
  while (i !== entry.edgeIndex) {
    i = (i + 1) % ccw.length;
    const v = ccw[i]!;
    if (!ptEq(v, exit.point) && !ptEq(v, entry.point)) right.push(v);
  }
  if (!ptEq(entry.point, right[right.length - 1]!)) right.push(entry.point);

  return [left, right];
}

// ── Rectangle helper ────────────────────────────────────────────

/**
 * Create a rectangle polygon from width and height (in normalized coords).
 * Counter-clockwise winding starting from bottom-left.
 */
export function rectangle(w: number, h: number): Polygon {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/**
 * Create a rectangle polygon centered at origin.
 */
export function centeredRectangle(w: number, h: number): Polygon {
  const hw = w / 2, hh = h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

// ── Area ratio (for proportional cost allocation) ───────────────

/**
 * Compute the fraction of the parent area each child occupies.
 * Used for proportional cost allocation (matches the partition service's
 * `allocateCostByArea` logic, but computed from polygon geometry).
 */
export function areaRatios(
  parentArea: number,
  childAreas: number[],
): number[] {
  if (parentArea === 0) throw new Error("Parent area cannot be zero for area ratio calculation");
  return childAreas.map((a) => a / parentArea);
}

// ── Bounding box ────────────────────────────────────────────────

export function boundingBox(poly: Polygon): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Normalize a polygon to [0,1] × [0,1] coordinates (relative to its bounding box).
 * This is what we store in the DB — resolution-independent geometry.
 */
export function normalizePolygon(poly: Polygon): Polygon {
  const bb = boundingBox(poly);
  if (bb.width < EPS || bb.height < EPS) return poly;
  return poly.map((p) => ({
    x: (p.x - bb.minX) / bb.width,
    y: (p.y - bb.minY) / bb.height,
  }));
}

// ── SVG path string ─────────────────────────────────────────────

/**
 * Convert a polygon to an SVG path string (for rendering in the canvas).
 * Points are scaled to the given pixel dimensions.
 */
export function toSvgPath(poly: Polygon, width: number, height: number): string {
  if (poly.length === 0) return "";
  const pts = poly.map((p) => `${(p.x * width).toFixed(2)},${(p.y * height).toFixed(2)}`);
  return `M ${pts[0]} L ${pts.slice(1).join(" L ")} Z`;
}
