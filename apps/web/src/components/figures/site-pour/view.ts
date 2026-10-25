// ─────────────────────────────────────────────────────────────
// Site pour — world layout for the isometric figure.
// Units ≈ cm at figure scale. x→right, y→down-right (depth), z↑up.
// The whole site is a formwork deck on acrow props, mid-pour.
// ─────────────────────────────────────────────────────────────
import { fitProjection, iso, type Plan } from "@/components/iso/iso-kit";

// Ground + deck
export const GROUND: Plan = { x: 0, y: 0, w: 300, d: 220, r: 10 };
export const DECK: Plan = { x: 60, y: 40, w: 170, d: 120, r: 2 };
export const DECK_Z = 62;          // top of the formwork deck
export const DECK_H = 6;           // deck plywood thickness
export const SIDE_H = 10;          // shuttering batten height above deck
export const PROP_Z = 6;           // props sit on a mud/sill plate
export const PROP_H = DECK_Z - DECK_H - PROP_Z; // prop height

// Acrow props — 3×3 grid under the deck
export const PROP_XY: [number, number][] = [
  [78, 55], [145, 55], [212, 55],
  [78, 100], [145, 100], [212, 100],
  [78, 145], [145, 145], [212, 145],
];
export const PROP_R = 2.4;
export const PROP_COLLAR_R = 3.6;

// Rebar mat on the deck top
export const REBAR_Z = DECK_Z + SIDE_H;      // bars at shuttering top height
export const REBAR_BARS_X = 9;               // longitudinal bars
export const REBAR_BARS_Y = 7;               // transverse bars
export const REBAR_INSET = 8;

// The pour — wet concrete advancing along +x in bays
export const POUR_BAYS = 4;
export const BAY_W = DECK.w / POUR_BAYS;

// Side clutter (left of deck)
export const PALLET: Plan = { x: 18, y: 130, w: 34, d: 26, r: 2 };
export const BAG = { w: 14, d: 9, h: 3.4 };   // cement bag dims
export const DRUM = { x: 262, y: 150, r: 9, h: 22 }; // water barrel (right)
export const SAND = { x: 30, y: 100, r: 17 }; // sand heap — forward of the deck's left edge
export const BARROW: Plan = { x: 240, y: 62, w: 30, d: 16, r: 3 }; // wheelbarrow
export const BRICKS: Plan = { x: 246, y: 180, w: 36, d: 22, r: 2 }; // brick stack
export const REBARBUNDLE = { x: 96, y: 178, len: 74 }; // rebar bundle on the ground
// column kickers — vertical rebar stubs at the deck's far edge, where the
// next columns will rise. Four stubs, 4 bars each.
export const KICKERS: [number, number][] = [
  [88, 52], [152, 52], [216, 52], [88, 108],
];
export const KICKER_H = 14;

// Camera
export const FIG_W = 640;
export const FIG_H = 420;
export const P = fitProjection(
  [
    [GROUND.x, GROUND.y, 0],
    [GROUND.x + GROUND.w, GROUND.y, 0],
    [GROUND.x, GROUND.y + GROUND.d, 0],
    [GROUND.x + GROUND.w, GROUND.y + GROUND.d, 0],
    [DECK.x, DECK.y, REBAR_Z + 2],
    [DECK.x + DECK.w, DECK.y + DECK.d, REBAR_Z + 2],
  ],
  FIG_W,
  FIG_H,
  { pad: 28, azimuth: 45, elevation: 26 },
);

export const at = (p: [number, number, number]) => iso(p, P);

// Pour model — the figure's truth: 4 bays pour in sequence, each takes a
// share of a bag of cement; the readout reports the current bay + bags used.
export const POUR_PERIOD_S = 18;
export const BAGS_PER_BAY = 7;

/** The canonical mapping: progress ∈ [0,1] → which bay + how wet it is. */
export function pourForProgress(progress: number) {
  const fill = Math.min(Math.max(progress, 0), 1);
  const bay = Math.min(Math.floor(fill * POUR_BAYS), POUR_BAYS - 1);
  const within = Math.min(fill * POUR_BAYS - bay, 1);
  return { fill, bay, within };
}

/** The canned loop — cycles the pour on a clock for surfaces with no
    real progress to drive it (public empty states). */
export function pourAt(t: number) {
  const cycle = (t % POUR_PERIOD_S) / POUR_PERIOD_S; // 0..1 across all bays
  const fill = Math.min(cycle * 1.15, 1);            // 87% pour, 13% rest
  const { bay, within } = pourForProgress(fill);
  const bags = Math.round((bay + within) * BAGS_PER_BAY * 10) / 10;
  return { fill, bay, within, bags };
}
export const POUR_REST = { fill: 0.35, bay: 1, within: 0.4, bags: 9.8 };
export const readoutOf = (p: { bay: number; within: number; bags: number }) =>
  `Bay ${Math.min(p.bay + 1, POUR_BAYS)}/${POUR_BAYS}${p.bags > 0 ? ` · ${p.bags.toFixed(1)} bags` : ""} · ${Math.round((p.bay + p.within) / POUR_BAYS * 100)}% poured`;
