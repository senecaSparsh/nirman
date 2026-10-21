// ─────────────────────────────────────────────────────────────
// Site pour — every static path, computed once at module load.
// Painter's order is the JSX order in art.tsx: back/bottom first.
// ─────────────────────────────────────────────────────────────
import {
  circleRing, dotGrid, extrude, onTop, pathOf,
  sideRing, slabOf,
  type Flat, type Plan, type Plane, type Point3,
} from "@/components/iso/iso-kit";
import {
  at, BAG, BARROW, BAY_W, BRICKS, DECK, DECK_H, DECK_Z, DRUM, GROUND,
  KICKERS, KICKER_H, P, PALLET, PROP_COLLAR_R, PROP_H, PROP_R, PROP_XY,
  PROP_Z, REBAR_BARS_X, REBAR_BARS_Y, REBARBUNDLE, REBAR_INSET, REBAR_Z,
  SAND, SIDE_H,
} from "./view";

const slab = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) =>
  slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 28) =>
  extrude(circleRing(cx, cy, r, steps), z, h, P, { convex: true });
const seg = (a: Point3, b: Point3) => pathOf([at(a), at(b)]);
const flatTop = (pts: Plane[] | Flat[], z: number, closed = true) =>
  onTop(pts as Plane[], z, P, closed);
const join = (xs: string[]) => xs.join("");

// ── Ground ────────────────────────────────────────────────────
export const GROUND_SOLID = slab(GROUND, -4, 4, 6, 1.2);
// gravel speckles on the ground, away from the deck shadow
export const GRAVEL_DOTS: Flat[] = dotGrid(
  GROUND.x + 10, GROUND.y + 10, 12, 9, 22, 0, P,
).filter((p, i) => i % 3 === 0);
// mud/sill plate under the props
export const SILL_SOLID = slab(
  { x: DECK.x - 6, y: DECK.y - 6, w: DECK.w + 12, d: DECK.d + 12, r: 1 },
  0, 2, 4, 0.4,
);

// ── Props (acrow jacks) — each: base foot, outer tube, collar, inner tube,
// top plate, wing-nut dot ─────────────────────────────────────
export const PROP_FEET = PROP_XY.map(([x, y]) =>
  slab({ x: x - 4.5, y: y - 4.5, w: 9, d: 9, r: 1 }, PROP_Z - 2, 2, 4, 0.3));
export const PROP_OUTERS = PROP_XY.map(([x, y]) =>
  cyl(x, y, PROP_R, PROP_Z, PROP_H * 0.55, 14));
export const PROP_COLLARS = PROP_XY.map(([x, y]) =>
  cyl(x, y, PROP_COLLAR_R, PROP_Z + PROP_H * 0.5, PROP_H * 0.12, 14));
export const PROP_INNERS = PROP_XY.map(([x, y]) =>
  cyl(x, y, PROP_R - 0.7, PROP_Z + PROP_H * 0.55, PROP_H * 0.45, 14));
export const PROP_TOPS = PROP_XY.map(([x, y]) =>
  slab({ x: x - 5, y: y - 5, w: 10, d: 10, r: 1 }, PROP_Z + PROP_H - 1, 2, 4, 0.3));
export const PROP_WINGNUTS = PROP_XY.map(([x, y]) =>
  seg([x - 5, y, PROP_Z + PROP_H * 0.56], [x + 5, y, PROP_Z + PROP_H * 0.56]));

// ── Formwork deck + shuttering ────────────────────────────────
export const DECK_SOLID = slab(DECK, DECK_Z - DECK_H, DECK_H, 4, 0.4);
// plywood sheet seams on the deck top
export const DECK_SEAMS = join(
  [0.33, 0.67].map((f) =>
    seg(
      [DECK.x + DECK.w * f, DECK.y + 1, DECK_Z + 0.05],
      [DECK.x + DECK.w * f, DECK.y + DECK.d - 1, DECK_Z + 0.05],
    )),
);
// shuttering battens — four side strips standing on the deck edge
const BATTEN_T = 3;
const batten = (plan: Plan) => slab(plan, DECK_Z, SIDE_H, 4, 0.2);
export const BATTENS = [
  batten({ x: DECK.x - BATTEN_T, y: DECK.y - BATTEN_T, w: DECK.w + BATTEN_T * 2, d: BATTEN_T, r: 0.5 }), // back (far)
  batten({ x: DECK.x - BATTEN_T, y: DECK.y - BATTEN_T, w: BATTEN_T, d: DECK.d + BATTEN_T * 2, r: 0.5 }), // left
  batten({ x: DECK.x + DECK.w, y: DECK.y - BATTEN_T, w: BATTEN_T, d: DECK.d + BATTEN_T * 2, r: 0.5 }),   // right
  batten({ x: DECK.x - BATTEN_T, y: DECK.y + DECK.d, w: DECK.w + BATTEN_T * 2, d: BATTEN_T, r: 0.5 }),   // front
];
// waling cleats — small blocks tying battens to the deck edge, every ~40cm
const cleatXs = Array.from({ length: 4 }, (_, i) => DECK.x + 12 + i * (DECK.w - 24) / 3);
export const CLEATS_FRONT = cleatXs.map((x) =>
  slab({ x: x - 2, y: DECK.y + DECK.d + BATTEN_T, w: 4, d: 3, r: 0.4 }, DECK_Z, SIDE_H - 2, 4, 0.15));
export const CLEATS_LEFT = Array.from({ length: 3 }, (_, i) => i).map((i) =>
  slab({ x: DECK.x - BATTEN_T - 3, y: DECK.y + 12 + i * (DECK.d - 24) / 2, w: 3, d: 4, r: 0.4 }, DECK_Z, SIDE_H - 2, 4, 0.15));

// ── Rebar mat — bars along x then along y on top of the deck ──
const rbx = (i: number) => REBAR_INSET + (i * (DECK.w - REBAR_INSET * 2)) / (REBAR_BARS_X - 1);
const rby = (i: number) => REBAR_INSET + (i * (DECK.d - REBAR_INSET * 2)) / (REBAR_BARS_Y - 1);
export const REBAR_X = join(
  Array.from({ length: REBAR_BARS_X }, (_, i) =>
    seg(
      [DECK.x + rbx(i), DECK.y + REBAR_INSET - 2, REBAR_Z],
      [DECK.x + rbx(i), DECK.y + DECK.d - REBAR_INSET + 2, REBAR_Z],
    )),
);
export const REBAR_Y = join(
  Array.from({ length: REBAR_BARS_Y }, (_, i) =>
    seg(
      [DECK.x + REBAR_INSET - 2, DECK.y + rby(i), REBAR_Z - 1.4],
      [DECK.x + DECK.w - REBAR_INSET + 2, DECK.y + rby(i), REBAR_Z - 1.4],
    )),
);
// bar chairs — tiny spacer dots under the mat on the deck
export const REBAR_CHAIRS: Flat[] = [];
for (let i = 0; i < 4; i++)
  for (let j = 0; j < 3; j++)
    REBAR_CHAIRS.push(at([DECK.x + 20 + i * (DECK.w - 40) / 3, DECK.y + 20 + j * (DECK.d - 40) / 2, DECK_Z + 0.5]));

// ── Wet pour band (one bay's worth of wet concrete, drawn at the
//    live position by the client; rest pose = POUR_REST) ───────
export const pourBandAt = (bay: number, within: number) => {
  const x0 = DECK.x + bay * BAY_W;
  const w = Math.max(BAY_W * within, 2);
  return slab(
    { x: x0, y: DECK.y + 1.5, w: Math.min(w, BAY_W - 1), d: DECK.d - 3, r: 1 },
    DECK_Z + 0.1, SIDE_H - 0.6, 4, 0.4,
  );
};
// solid bays already poured
export const pouredBayAt = (bay: number) =>
  slab(
    { x: DECK.x + bay * BAY_W, y: DECK.y + 1.5, w: BAY_W - 1, d: DECK.d - 3, r: 1 },
    DECK_Z + 0.1, SIDE_H - 0.6, 4, 0.4,
  );
// slump cone sitting on the deck near the pour
export const SLUMP_CONE = cyl(DECK.x + DECK.w - 14, DECK.y + DECK.d - 18, 4.6, DECK_Z + SIDE_H, 7, 20);
export const SLUMP_BASE = slab(
  { x: DECK.x + DECK.w - 21, y: DECK.y + DECK.d - 24, w: 14, d: 12, r: 1 },
  DECK_Z + SIDE_H, 0.8, 4, 0.2,
);

// ── Cement-bag pallet (left of the deck) ──────────────────────
export const PALLET_SOLID = slab(PALLET, 2, 3, 4, 0.3);
// pallet slat seams
export const PALLET_SEAMS = join(
  [0.35, 0.7].map((f) =>
    seg(
      [PALLET.x + PALLET.w * f, PALLET.y + 0.5, 5.1],
      [PALLET.x + PALLET.w * f, PALLET.y + PALLET.d - 0.5, 5.1],
    )),
);
// bags — two courses, staggered, slightly rounded
const bagAt = (i: number, j: number, layer: number) =>
  slab(
    {
      x: PALLET.x + 2 + i * (BAG.w + 1) + (layer % 2) * 3,
      y: PALLET.y + 2 + j * (BAG.d + 1.5),
      w: BAG.w, d: BAG.d, r: 2.6,
    },
    5 + layer * BAG.h, BAG.h, 6, 0.8,
  );
export const BAGS = [
  bagAt(0, 0, 0), bagAt(1, 0, 0), bagAt(0, 1, 0), bagAt(1, 1, 0),
  bagAt(0, 0, 1), bagAt(1, 0, 1), bagAt(0, 1, 1),
];
// one open bag, tipped — an empty bag lying on the pallet corner
export const OPEN_BAG = slab(
  { x: PALLET.x + PALLET.w - 8, y: PALLET.y + PALLET.d - 6, w: 12, d: 7, r: 2.4 },
  5 + 2 * BAG.h, 1.2, 6, 0.5,
);

// ── Sand heap — three stacked flattened discs ─────────────────
export const SAND_DISCS = [
  extrude(circleRing(SAND.x, SAND.y, SAND.r, 26), 0, 3, P, { convex: true }),
  extrude(circleRing(SAND.x, SAND.y, SAND.r * 0.62, 26), 3, 3, P, { convex: true }),
  extrude(circleRing(SAND.x, SAND.y, SAND.r * 0.28, 26), 6, 2.4, P, { convex: true }),
];

// ── Water barrel (right of deck) ──────────────────────────────
export const DRUM_SOLID = cyl(DRUM.x, DRUM.y, DRUM.r, 0, DRUM.h, 26);
export const DRUM_BANDS = join([
  flatTop(circleRing(DRUM.x, DRUM.y, DRUM.r + 0.05, 24), DRUM.h * 0.32),
  flatTop(circleRing(DRUM.x, DRUM.y, DRUM.r + 0.05, 24), DRUM.h * 0.68),
]);
export const DRUM_WATER = flatTop(circleRing(DRUM.x, DRUM.y, DRUM.r - 1.2, 24), DRUM.h + 0.05);

// ── Wheelbarrow — tray, wheel, two handles, two legs ─────────
export const BARROW_TRAY = slab(BARROW, 10, 7, 6, 1);
// wheel — a disc in the vertical yz-plane at the barrow's nose
export const BARROW_WHEEL = sideRing(
  [BARROW.x - 2, BARROW.y + BARROW.d / 2, 5],
  5, "x", P, 20,
);
export const BARROW_HUB = sideRing(
  [BARROW.x - 2, BARROW.y + BARROW.d / 2, 5],
  1.4, "x", P, 12,
);
export const BARROW_HANDLES = join([
  seg([BARROW.x + BARROW.w - 2, BARROW.y + 3, 12], [BARROW.x + BARROW.w + 8, BARROW.y + 1, 7]),
  seg([BARROW.x + BARROW.w - 2, BARROW.y + BARROW.d - 3, 12], [BARROW.x + BARROW.w + 8, BARROW.y + BARROW.d + 1, 7]),
]);
export const BARROW_LEGS = join([
  seg([BARROW.x + 4, BARROW.y + 4, 10], [BARROW.x + 3, BARROW.y + 4, 0]),
  seg([BARROW.x + 4, BARROW.y + BARROW.d - 4, 10], [BARROW.x + 3, BARROW.y + BARROW.d - 4, 0]),
]);
// a shovel leaning: handle up, blade on the ground
export const SHOVEL_HANDLE = seg(
  [PALLET.x + PALLET.w + 6, PALLET.y + 4, 0],
  [PALLET.x + PALLET.w + 1, PALLET.y - 2, 16],
);
export const SHOVEL_BLADE = slab(
  { x: PALLET.x + PALLET.w + 3, y: PALLET.y + 2, w: 6, d: 7, r: 1.4 },
  0, 0.7, 6, 0.3,
);

// ── Deck-top label: a small tag plate screwed to the front batten ──
export const TAG_PLATE = slab(
  { x: DECK.x + DECK.w / 2 - 11, y: DECK.y + DECK.d + BATTEN_T + 0.2, w: 22, d: 2, r: 0.6 },
  DECK_Z + 2, 6, 4, 0.2,
);
export const TAG_RULES = join(
  [0, 1, 2].map((i) =>
    seg(
      [DECK.x + DECK.w / 2 - 8, DECK.y + DECK.d + BATTEN_T + 1, DECK_Z + 3.2 + i * 1.6],
      [DECK.x + DECK.w / 2 + 8, DECK.y + DECK.d + BATTEN_T + 1, DECK_Z + 3.2 + i * 1.6],
    )),
);

// ── Column kickers — 4-bar stubs standing on the deck, tied to the mat ──
export const KICKER_BARS = join(
  KICKERS.flatMap(([kx, ky]) =>
    ([[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as [number, number][]).map(([dx, dy]) =>
      seg([kx + dx, ky + dy, DECK_Z], [kx + dx, ky + dy, DECK_Z + KICKER_H]),
    )),
);
// tie bands — two horizontal hoops per kicker
export const KICKER_TIES = join(
  KICKERS.flatMap(([kx, ky]) =>
    [DECK_Z + 4, DECK_Z + 10].flatMap((z) => [
      seg([kx - 3.4, ky - 3.4, z], [kx + 3.4, ky - 3.4, z]),
      seg([kx - 3.4, ky + 3.4, z], [kx + 3.4, ky + 3.4, z]),
      seg([kx - 3.4, ky - 3.4, z], [kx - 3.4, ky + 3.4, z]),
      seg([kx + 3.4, ky - 3.4, z], [kx + 3.4, ky + 3.4, z]),
    ]),
  ),
);

// ── Brick stack — three courses of small blocks ──────────────
const brickAt = (row: number, col: number, layer: number) =>
  slab(
    {
      x: BRICKS.x + 2 + col * 11.5 + (layer % 2) * 5.5,
      y: BRICKS.y + 2 + row * 9.5,
      w: 10.5, d: 8.5, r: 0.6,
    },
    1.2 + layer * 4.6, 4.4, 4, 0.15,
  );
export const BRICKS_SOLID = [
  brickAt(0, 0, 0), brickAt(0, 1, 0), brickAt(1, 0, 0), brickAt(1, 1, 0),
  brickAt(0, 0, 1), brickAt(1, 0, 1), brickAt(0, 0, 2),
];
export const BRICKS_SHADOW = slab(
  { x: BRICKS.x - 1, y: BRICKS.y - 1, w: BRICKS.w + 2, d: BRICKS.d + 2, r: 2 },
  0, 1.2, 4, 0.2,
);

// ── Rebar bundle — straight bars lying on the ground, banded ──
export const REBAR_BUNDLE = join(
  [0, 2.2, 4.4].map((off) =>
    seg(
      [REBARBUNDLE.x, REBARBUNDLE.y + off, 1.2],
      [REBARBUNDLE.x + REBARBUNDLE.len, REBARBUNDLE.y + off, 1.2],
    )),
);
export const REBAR_BUNDLE_BANDS = join(
  [0.2, 0.5, 0.8].map((f) =>
    seg(
      [REBARBUNDLE.x + REBARBUNDLE.len * f, REBARBUNDLE.y - 0.8, 1.8],
      [REBARBUNDLE.x + REBARBUNDLE.len * f, REBARBUNDLE.y + 5.2, 1.8],
    )),
);
