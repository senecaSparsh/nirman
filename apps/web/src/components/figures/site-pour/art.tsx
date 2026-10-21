// ─────────────────────────────────────────────────────────────
// Site pour — static art, painter's order: ground → sill → props →
// deck → shuttering → clutter → rebar → pour band (live) → trim.
// ─────────────────────────────────────────────────────────────
import { Dots, Line, Solid } from "@/components/iso/react/draw";
import {
  BAGS, BARROW_HANDLES, BARROW_HUB, BARROW_LEGS, BARROW_TRAY, BARROW_WHEEL,
  BATTENS, BRICKS_SHADOW, BRICKS_SOLID, CLEATS_FRONT, CLEATS_LEFT,
  DECK_SEAMS, DECK_SOLID,
  KICKER_BARS, KICKER_TIES,
  DRUM_BANDS, DRUM_SOLID, DRUM_WATER, GRAVEL_DOTS, GROUND_SOLID,
  OPEN_BAG, PALLET_SEAMS, PALLET_SOLID, pouredBayAt, pourBandAt,
  REBAR_BUNDLE, REBAR_BUNDLE_BANDS,
  PROP_COLLARS, PROP_FEET, PROP_INNERS, PROP_OUTERS, PROP_TOPS, PROP_WINGNUTS,
  REBAR_CHAIRS, REBAR_X, REBAR_Y, SAND_DISCS, SHOVEL_BLADE, SHOVEL_HANDLE,
  SILL_SOLID, SLUMP_BASE, SLUMP_CONE, TAG_PLATE, TAG_RULES,
} from "./geometry";
import { POUR_REST } from "./view";
import { SitePourLive } from "./live";

const rest = pourBandAt(POUR_REST.bay, POUR_REST.within);
const poured = [0].map(pouredBayAt); // bay 0 is already cast at rest

export function SitePourArt() {
  return (
    <>
      {/* ground + shadow sill */}
      <Solid paths={GROUND_SOLID} tone="lo" halo />
      <Dots points={GRAVEL_DOTS} size={0.9} tone="mid" />
      <Solid paths={SILL_SOLID} tone="mid" />

      {/* acrow props under the deck */}
      {PROP_FEET.map((p, i) => <Solid key={`pf${i}`} paths={p} tone="mid" />)}
      {PROP_OUTERS.map((p, i) => <Solid key={`po${i}`} paths={p} tone="hi" />)}
      {PROP_COLLARS.map((p, i) => <Solid key={`pc${i}`} paths={p} tone="mid" />)}
      {PROP_INNERS.map((p, i) => <Solid key={`pi${i}`} paths={p} tone="lo" />)}
      {PROP_TOPS.map((p, i) => <Solid key={`pt${i}`} paths={p} tone="mid" />)}
      {PROP_WINGNUTS.map((d, i) => <Line key={`pw${i}`} d={d} tone="hi" />)}

      {/* sand heap behind-left */}
      {SAND_DISCS.map((p, i) => <Solid key={`sd${i}`} paths={p} tone={i === 2 ? "hi" : "mid"} />)}

      {/* ground clutter — brick stack + rebar bundle */}
      <Solid paths={BRICKS_SHADOW} tone="lo" />
      {BRICKS_SOLID.map((p, i) => <Solid key={`br${i}`} paths={p} tone="mid" />)}
      <Line d={REBAR_BUNDLE} tone="hi" />
      <Line d={REBAR_BUNDLE_BANDS} tone="mid" />

      {/* formwork deck + plywood seams */}
      <Solid paths={DECK_SOLID} tone="mid" />
      <Line d={DECK_SEAMS} tone="lo" />

      {/* shuttering battens on the deck rim */}
      {BATTENS.map((p, i) => <Solid key={`b${i}`} paths={p} tone="hi" />)}
      {CLEATS_LEFT.map((p, i) => <Solid key={`cl${i}`} paths={p} tone="mid" />)}

      {/* water barrel to the right */}
      <Solid paths={DRUM_SOLID} tone="mid" />
      <Line d={DRUM_BANDS} tone="hi" />
      <path d={DRUM_WATER} className="iso-line" data-tone="hi" fill="none" />

      {/* wheelbarrow in the corner */}
      <Line d={BARROW_WHEEL} tone="hi" />
      <Line d={BARROW_HUB} tone="mid" />
      <Line d={BARROW_HANDLES} tone="hi" />
      <Line d={BARROW_LEGS} tone="mid" />
      <Solid paths={BARROW_TRAY} tone="hi" />

      {/* cement pallet + bags */}
      <Solid paths={PALLET_SOLID} tone="mid" />
      <Line d={PALLET_SEAMS} tone="lo" />
      <Line d={SHOVEL_HANDLE} tone="hi" />
      <Solid paths={SHOVEL_BLADE} tone="mid" />
      {BAGS.map((p, i) => <Solid key={`bag${i}`} paths={p} tone="hi" />)}
      <Solid paths={OPEN_BAG} tone="mid" />

      {/* slump cone kit on the deck corner */}
      <Solid paths={SLUMP_BASE} tone="mid" />
      <Solid paths={SLUMP_CONE} tone="hi" />

      {/* poured bays + the live pour band — the wet edge moves */}
      {poured.map((p, i) => <g key={`pd${i}`} className="set-pour"><Solid paths={p} tone="mid" /></g>)}
      <SitePourLive restPaths={rest} />

      {/* rebar mat on top of everything cast */}
      <Line d={REBAR_X} tone="hi" />
      <Line d={REBAR_Y} tone="mid" />
      <Dots points={REBAR_CHAIRS} size={0.7} tone="lo" />

      {/* column kickers — the next floor's stubs, tied at the mat */}
      <Line d={KICKER_BARS} tone="hi" />
      <Line d={KICKER_TIES} tone="mid" />

      {/* front cleats + the tag plate last */}
      {CLEATS_FRONT.map((p, i) => <Solid key={`cf${i}`} paths={p} tone="mid" />)}
      <Solid paths={TAG_PLATE} tone="mid" />
      <Line d={TAG_RULES} tone="lo" />
    </>
  );
}
