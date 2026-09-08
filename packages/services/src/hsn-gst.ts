import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

/**
 * HSN / SAC Master — government-provided HSN codes with GST rates.
 *
 * The system auto-picks the GST rate when a material's HSN code is entered,
 * so users never have to look up the rate manually. Seeded from CBIC data
 * (a curated subset of the most common construction-industry HSN codes is
 * included in `seedHsnGstRates`; the full CBIC master can be loaded later).
 */

export interface HsnGstEntry {
  hsnCode: string;
  description: string;
  gstRate: Decimal | number | string;
  sacCode?: string | null;
  category?: string | null;
}

/**
 * Score an HSN entry's description against search words.
 * Pure function — no DB access.
 *
 * Scoring:
 *   +10 for each word that is included in the description
 *   +5  for each word that the description starts with
 */
export function scoreHsnDescription(description: string, words: string[]): number {
  const desc = description.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (desc.includes(w)) score += 10;
    if (desc.startsWith(w)) score += 5;
  }
  return score;
}

/**
 * Extract search words (≥3 chars) from a query string.
 * Pure function — no DB access.
 */
export function extractSearchWords(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter((w) => w.length >= 3);
}

/**
 * Curated HSN/SAC master for the construction industry. This covers the
 * most common materials a real-estate builder procures. The full CBIC
 * master (~12,000 codes) can be loaded from a JSON file later — this seed
 * ensures the system is useful out of the box.
 */
const CONSTRUCTION_HSN_MASTER: HsnGstEntry[] = [
  // ── Cement & Lime ──
  // GST 2.0 (22 Sep 2025): cement reduced from 28% to 18%
  { hsnCode: "2523", description: "Portland cement, aluminous cement, slag cement, supersulphate cement", gstRate: 18 },
  { hsnCode: "2522", description: "Quicklime, slaked lime and hydraulic lime", gstRate: 18 },
  { hsnCode: "2521", description: "Limestone flux, limestone and other calcareous stone", gstRate: 5 },

  // ── Iron & Steel ──
  { hsnCode: "7213", description: "Bars and rods, hot-rolled, in irregularly wound coils, of iron or non-alloy steel", gstRate: 18 },
  { hsnCode: "7214", description: "Other bars and rods of iron or non-alloy steel, not further worked than forged, hot-rolled", gstRate: 18 },
  { hsnCode: "7215", description: "Other bars and rods of iron or non-alloy steel", gstRate: 18 },
  { hsnCode: "7216", description: "Angles, shapes and sections of iron or non-alloy steel", gstRate: 18 },
  { hsnCode: "7228", description: "Other bars and rods of other alloy steel", gstRate: 18 },
  { hsnCode: "7301", description: "Sheet piling of iron or steel, welded angles, shapes and sections", gstRate: 18 },
  { hsnCode: "7302", description: "Railway or tramway track construction material of iron or steel", gstRate: 18 },
  { hsnCode: "7304", description: "Tubes, pipes and hollow profiles, seamless, of iron or steel", gstRate: 18 },
  { hsnCode: "7306", description: "Other tubes, pipes and hollow profiles, of iron or steel", gstRate: 18 },
  { hsnCode: "7308", description: "Structures and parts of structures, of iron or steel", gstRate: 18 },
  { hsnCode: "7310", description: "Tanks, casks, drums, cans, boxes of iron or steel", gstRate: 18 },
  { hsnCode: "7315", description: "Chain and parts thereof, of iron or steel", gstRate: 18 },
  { hsnCode: "7317", description: "Nails, tacks, drawing pins, corrugated nails, staples of iron or steel", gstRate: 18 },
  { hsnCode: "7318", description: "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter pins", gstRate: 18 },

  // ── Aluminium ──
  { hsnCode: "7604", description: "Aluminium bars, rods and profiles", gstRate: 18 },
  { hsnCode: "7608", description: "Aluminium tubes and pipes", gstRate: 18 },
  { hsnCode: "7610", description: "Aluminium structures and parts of structures", gstRate: 18 },

  // ── Bricks & Building Stone ──
  { hsnCode: "6810", description: "Articles of cement, concrete or artificial stone, bricks, building blocks", gstRate: 18 },
  { hsnCode: "6901", description: "Bricks, blocks, tiles and other ceramic goods of siliceous fossil meals", gstRate: 5 },
  { hsnCode: "6902", description: "Refractory bricks, blocks, tiles and similar ceramic goods", gstRate: 18 },
  { hsnCode: "6904", description: "Ceramic building bricks, flooring blocks, support or filler tiles", gstRate: 5 },
  { hsnCode: "6905", description: "Roofing tiles, chimney pots, cowls, chimney liners, architectural ornaments", gstRate: 5 },
  { hsnCode: "6907", description: "Unglazed ceramic flags and paving tiles, hearth tiles", gstRate: 5 },
  { hsnCode: "6908", description: "Glazed ceramic flags and paving tiles, hearth tiles", gstRate: 5 },
  { hsnCode: "2515", description: "Marble, travertine, ecaussine and other calcareous monumental or building stone", gstRate: 5 },
  { hsnCode: "2516", description: "Granite, porphyry, basalt, sandstone and other monumental or building stone", gstRate: 5 },
  { hsnCode: "2517", description: "Pebbles, gravel, broken or crushed stone, macadam, dolomite", gstRate: 5 },

  // ── Sand & Aggregates ──
  { hsnCode: "2505", description: "Natural sands of all kinds, whether or not coloured, other metal-bearing sands", gstRate: 5 },
  { hsnCode: "2529", description: "Siliceous fossil meals and similar siliceous earths", gstRate: 5 },

  // ── Wood & Timber ── (GST 2.0: wood products at 12%)
  { hsnCode: "4407", description: "Wood sawn or chipped lengthwise, sliced or peeled, of thickness exceeding 6mm", gstRate: 12 },
  { hsnCode: "4408", description: "Sheets for veneering, plywood, of thickness not exceeding 6mm", gstRate: 12 },
  { hsnCode: "4410", description: "Particle board and similar board of wood or other ligneous materials", gstRate: 12 },
  { hsnCode: "4412", description: "Plywood, veneered panels and similar laminated wood", gstRate: 12 },
  { hsnCode: "4418", description: "Builders' joinery and carpentry of wood, including cellular wood panels", gstRate: 12 },
  { hsnCode: "4421", description: "Other articles of wood", gstRate: 12 },

  // ── Glass ──
  { hsnCode: "7005", description: "Glass of float and surface ground or polished, in sheets", gstRate: 18 },
  { hsnCode: "7008", description: "Multiple-walled insulating units of glass", gstRate: 18 },
  // GST 2.0: glass building goods moved from 28% to 18%
  { hsnCode: "7016", description: "Paving blocks, bricks, tiles and other glass goods for building", gstRate: 18 },

  // ── Paints & Coatings ──
  { hsnCode: "3208", description: "Paints and varnishes based on synthetic polymers or chemically modified natural polymers", gstRate: 18 },
  { hsnCode: "3209", description: "Paints and varnishes based on acrylic or vinyl polymers", gstRate: 18 },
  { hsnCode: "3210", description: "Other paints and varnishes", gstRate: 18 },
  // GST 2.0: plaster/putty/mastic moved from 28% to 18%
  { hsnCode: "3214", description: "Glass frit, glazes, enamels, mastics, non-refractory surfacing preparations", gstRate: 18 },

  // ── Electrical & Wiring ──
  { hsnCode: "8544", description: "Insulated wire, cable and other insulated conductors, with connector fittings", gstRate: 18 },
  { hsnCode: "8536", description: "Electrical apparatus for switching or protecting electrical circuits", gstRate: 18 },
  { hsnCode: "8537", description: "Boards, panels, consoles, desks, cabinets for electric control", gstRate: 18 },
  { hsnCode: "8504", description: "Electrical transformers, static converters and rectifiers", gstRate: 18 },
  { hsnCode: "9405", description: "Lamps and lighting fittings including searchlights and spotlights", gstRate: 18 },

  // ── Pipes & Fittings (PVC/CPVC) ──
  { hsnCode: "3917", description: "Tubes, pipes and hoses and fittings thereof, of plastics", gstRate: 18 },
  { hsnCode: "3925", description: "Builders' ware of plastics, not elsewhere specified or included", gstRate: 18 },

  // ── Sanitary Ware ──
  { hsnCode: "6910", description: "Ceramic sinks, wash basins, bath tubs, bidets, toilet pans, cisterns", gstRate: 18 },
  { hsnCode: "7324", description: "Sanitary ware and parts thereof, of iron or steel", gstRate: 18 },
  { hsnCode: "7418", description: "Table, kitchen or other household articles and parts thereof, of copper", gstRate: 18 },

  // ── Roofing & Waterproofing ──
  { hsnCode: "6807", description: "Articles of asphalt or of similar material, rolled roofing, waterproofing", gstRate: 18 },
  { hsnCode: "6808", description: "Panels, boards, tiles, blocks and similar articles of vegetable fibre", gstRate: 12 },
  { hsnCode: "6811", description: "Articles of asbestos-cement, cellulose fibre-cement", gstRate: 18 },
  { hsnCode: "6812", description: "Fabricated asbestos fibres; mixtures based on asbestos", gstRate: 18 },

  // ── Hardware & Fittings ──
  { hsnCode: "8302", description: "Base metal mountings, fittings and similar articles suitable for buildings", gstRate: 18 },
  { hsnCode: "8303", description: "Base metal padlocks, locks and keys", gstRate: 18 },
  { hsnCode: "8481", description: "Valves, cocks, valves and similar appliances for pipes, boiler shells", gstRate: 18 },

  // ── Construction Equipment & Machinery ──
  { hsnCode: "8428", description: "Other lifting, handling, loading machinery (lifts, escalators, conveyors)", gstRate: 18 },
  { hsnCode: "8430", description: "Other moving, grading, excavating, levelling machinery (dozers, excavators)", gstRate: 18 },
  { hsnCode: "8474", description: "Machinery for sorting, screening, separating, washing, crushing earth", gstRate: 18 },
  { hsnCode: "8501", description: "Electric motors and generators (DC/AC)", gstRate: 18 },
  { hsnCode: "8413", description: "Pumps for liquids, whether or not fitted with a measuring device", gstRate: 18 },

  // ── Fuel & Lubricants ──
  { hsnCode: "2710", description: "Petroleum oils and oils obtained from bituminous minerals", gstRate: 18 },
  { hsnCode: "3403", description: "Lubricating preparations, anti-rust or anti-corrosion preparations", gstRate: 18 },

  // ── Adhesives & Sealants ──
  { hsnCode: "3506", description: "Prepared glues and adhesives, including rubber solution", gstRate: 18 },
  { hsnCode: "3215", description: "Printing inks, writing or drawing inks and other inks", gstRate: 18 },

  // ── Safety Equipment ──
  { hsnCode: "6506", description: "Headgear and other headgear, safety helmets", gstRate: 18 },
  { hsnCode: "6117", description: "Made-up articles of knitted or crocheted fabrics (safety vests)", gstRate: 5 },
  { hsnCode: "6401", description: "Waterproof footwear with rubber or plastics uppers (safety boots)", gstRate: 18 },

  // ── Services (SAC) ──
  { hsnCode: "9954", description: "Construction services (civil, structural, finishing, repair)", gstRate: 18, category: "Services", sacCode: "9954" },
  { hsnCode: "9953", description: "Real estate services (sale, lease, brokerage)", gstRate: 18, category: "Services", sacCode: "9953" },
  { hsnCode: "9972", description: "Legal, accounting, auditing, consultancy services", gstRate: 18, category: "Services", sacCode: "9972" },
  { hsnCode: "9983", description: "Engineering, scientific and technical consulting services", gstRate: 18, category: "Services", sacCode: "9983" },
  { hsnCode: "9985", description: "Packaging, security, travel, transport support services", gstRate: 18, category: "Services", sacCode: "9985" },
  { hsnCode: "9965", description: "Transport of goods by road services", gstRate: 18, category: "Services", sacCode: "9965" },
  { hsnCode: "9966", description: "Transport support services, cargo handling, storage", gstRate: 18, category: "Services", sacCode: "9966" },
  // ── Rental / Leasing services (SAC 9973) ──
  // The business rents out cables, shuttering, scaffolding, equipment to
  // other parties. This is a SERVICE supply (SAC), not goods (HSN).
  { hsnCode: "9973", description: "Leasing or rental services with or without operator (parent heading)", gstRate: 18, category: "Services", sacCode: "9973" },
  { hsnCode: "997313", description: "Leasing/rental of construction machinery and equipment with or without operator", gstRate: 18, category: "Services", sacCode: "997313" },
  { hsnCode: "997314", description: "Leasing/rental of office machinery and equipment (except computers) with or without operator", gstRate: 18, category: "Services", sacCode: "997314" },
  { hsnCode: "997317", description: "Leasing/rental of other machinery and equipment with or without operator", gstRate: 18, category: "Services", sacCode: "997317" },
  { hsnCode: "997319", description: "Leasing/rental of other machinery and equipment (other than transport, agricultural, construction, office, computer, telecom)", gstRate: 18, category: "Services", sacCode: "997319" },
  { hsnCode: "997323", description: "Leasing/rental of furniture and fixtures with or without operator", gstRate: 18, category: "Services", sacCode: "997323" },
  { hsnCode: "997329", description: "Leasing/rental of other goods (general rental services)", gstRate: 18, category: "Services", sacCode: "997329" },
  // ── Real estate rental (SAC 99721) ──
  { hsnCode: "997211", description: "Rental or leasing of residential property (exempt under GST)", gstRate: 0, category: "Services", sacCode: "997211" },
  { hsnCode: "997212", description: "Rental or leasing of non-residential property (commercial rent)", gstRate: 18, category: "Services", sacCode: "997212" },

  // ── Detailed 8-digit HSN sub-codes (CBIC master) ──
  // Sandstone, limestone, marble — worked stone
  { hsnCode: "25171010", description: "Limestone for building (crushed stone)", gstRate: 5 },
  { hsnCode: "25171020", description: "Sand for building", gstRate: 5 },
  { hsnCode: "25171090", description: "Other crushed/granite stone for building", gstRate: 5 },
  // GST 2.0: cement sub-codes 28% → 18%
  { hsnCode: "25232900", description: "Other Portland cement", gstRate: 18 },
  { hsnCode: "25232100", description: "Cement clinkers", gstRate: 18 },
  { hsnCode: "68109900", description: "Other articles of cement/concrete (pipes, slabs, beams)", gstRate: 18 },
  { hsnCode: "68101100", description: "Concrete building blocks and bricks", gstRate: 18 },
  { hsnCode: "68101900", description: "Other articles of cement/concrete — building blocks", gstRate: 18 },
  { hsnCode: "68109100", description: "Articles of cement/concrete — pipes", gstRate: 18 },

  // Steel — detailed sub-codes
  { hsnCode: "72139100", description: "Wire rod — free cutting steel, hot-rolled", gstRate: 18 },
  { hsnCode: "72142090", description: "Other bars and rods (iron/steel) — hot-rolled", gstRate: 18 },
  { hsnCode: "72085100", description: "Hot-rolled steel plates — width ≥600mm, thickness >10mm", gstRate: 18 },
  { hsnCode: "72085200", description: "Hot-rolled steel plates — width ≥600mm, thickness 4.75-10mm", gstRate: 18 },
  { hsnCode: "72085300", description: "Hot-rolled steel plates — width ≥600mm, thickness 3-4.75mm", gstRate: 18 },
  { hsnCode: "7225", description: "Flat-rolled products of alloy/other steel — width ≥600mm", gstRate: 18 },
  { hsnCode: "73083000", description: "Doors, windows and their frames (iron/steel)", gstRate: 18 },
  { hsnCode: "73089000", description: "Other structures and parts of structures (iron/steel)", gstRate: 18 },
  { hsnCode: "73063000", description: "Welded tubes — circular cross-section (iron/steel)", gstRate: 18 },
  { hsnCode: "73181500", description: "Screws — other (iron/steel)", gstRate: 18 },
  { hsnCode: "73181600", description: "Nuts (iron/steel)", gstRate: 18 },
  { hsnCode: "73182100", description: "Spring washers (iron/steel)", gstRate: 18 },
  { hsnCode: "73182400", description: "Cotter pins and split pins (iron/steel)", gstRate: 18 },

  // Paints — detailed sub-codes
  { hsnCode: "32081010", description: "Paints based on acrylic/vinyl polymers", gstRate: 18 },
  { hsnCode: "32089020", description: "Other paints and enamels (polymer based)", gstRate: 18 },
  // GST 2.0: plaster/putty 28% → 18%
  { hsnCode: "32141000", description: "Plaster, putty, mastic — fillers/stopper", gstRate: 18 },

  // Worked stone
  { hsnCode: "68022100", description: "Marble — worked/granite blocks/slabs", gstRate: 18 },
  { hsnCode: "68022900", description: "Other worked monumental/building stone", gstRate: 18 },
  { hsnCode: "6805", description: "Abrasive powder/grain on base of textile/paper (sandpaper)", gstRate: 18 },

  // Plastics — detailed sub-codes
  { hsnCode: "39172300", description: "Rigid PVC tubes/pipes", gstRate: 18 },
  { hsnCode: "39251000", description: "Doors, windows, frames, thresholds (plastics)", gstRate: 18 },
  { hsnCode: "39252000", description: "Fittings for buildings (plastics — sinks, wash basins)", gstRate: 18 },
  { hsnCode: "39269000", description: "Other articles of plastics", gstRate: 18 },

  // Wood — detailed sub-codes (GST 12% for wood products)
  { hsnCode: "44101000", description: "Particle board, oriented strand board (OSB)", gstRate: 12 },
  { hsnCode: "44181000", description: "Windows, French windows, doors (wood)", gstRate: 12 },
  { hsnCode: "44182000", description: "Doors and their frames, thresholds (wood)", gstRate: 12 },
  { hsnCode: "44189000", description: "Other builders' carpentry of wood", gstRate: 12 },
  { hsnCode: "48141000", description: "Wallpaper (wood pulp/vinyl coated)", gstRate: 12 },

  // Electrical — detailed sub-codes
  { hsnCode: "85011000", description: "Universal AC/DC micro-motors (<37.5W)", gstRate: 18 },
  { hsnCode: "85044000", description: "Static converters (rectifiers, inverters)", gstRate: 18 },
  { hsnCode: "85361000", description: "Fuses (electrical, <1000V)", gstRate: 18 },
  { hsnCode: "85366900", description: "Plugs and sockets (<1000V)", gstRate: 18 },
  { hsnCode: "85444290", description: "Other insulated electric conductors (with connectors, ≤1000V)", gstRate: 18 },

  // Machinery — detailed sub-codes
  { hsnCode: "84137010", description: "Pumps — centrifugal (for liquids)", gstRate: 18 },
  { hsnCode: "84281000", description: "Lifts and skip hoists", gstRate: 18 },
  { hsnCode: "84283300", description: "Continuous-action elevators/conveyors — belt type", gstRate: 18 },
  { hsnCode: "84295100", description: "Front-end shovel loaders", gstRate: 18 },
  { hsnCode: "84295200", description: "Mechanical shovels and excavators", gstRate: 18 },
  { hsnCode: "84301000", description: "Pile-drivers and pile-extractors", gstRate: 18 },
  { hsnCode: "84306900", description: "Other boring/sinking machinery", gstRate: 18 },
  { hsnCode: "84741000", description: "Sorting/screening/separating machinery", gstRate: 18 },
  { hsnCode: "84742090", description: "Other crushing/grinding machinery (stone/ore)", gstRate: 18 },
  { hsnCode: "84798990", description: "Other machines with individual functions", gstRate: 18 },

  // GST 2.0 (Notification 14/2025): bricks and blocks restructured
  // Concrete bricks/blocks: 5%, Fly ash bricks/AAC blocks: 12%
  { hsnCode: "68101110", description: "Concrete bricks", gstRate: 5 },
  { hsnCode: "68101910", description: "Concrete building blocks", gstRate: 5 },
  { hsnCode: "68101190", description: "Fly ash bricks and blocks", gstRate: 12 },
  { hsnCode: "68101920", description: "Autoclaved aerated concrete (AAC) blocks", gstRate: 12 },
  { hsnCode: "68101990", description: "Other concrete articles for construction", gstRate: 18 },

  // Ceramic tiles
  { hsnCode: "69071000", description: "Unglazed ceramic tiles — water absorption <0.5%", gstRate: 5 },
  { hsnCode: "69072100", description: "Unglazed ceramic tiles — water absorption 0.5-3%", gstRate: 5 },
  { hsnCode: "69081000", description: "Glazed ceramic tiles — water absorption <0.5%", gstRate: 5 },
  { hsnCode: "69089000", description: "Other glazed ceramic tiles", gstRate: 5 },
  { hsnCode: "69149000", description: "Other ceramic articles", gstRate: 18 },

  // Bitumen, coal tar, asphalt
  { hsnCode: "2715", description: "Bituminous mixtures based on natural asphalt, bitumen, petroleum bitumen", gstRate: 18 },
  { hsnCode: "27150000", description: "Bituminous mixtures for road surfacing", gstRate: 18 },

  // Gypsum, plaster
  { hsnCode: "2520", description: "Gypsum, anhydrite, plasters of gypsum or calcium sulphate", gstRate: 18 },
  { hsnCode: "25202000", description: "Anhydrite and plasters of gypsum/calcium sulphate", gstRate: 18 },
  { hsnCode: "6809", description: "Articles of plaster or of compositions based on plaster", gstRate: 18 },
  { hsnCode: "68091100", description: "Boards, sheets and panels of plaster for construction", gstRate: 18 },
  { hsnCode: "68091900", description: "Other articles of plaster for construction", gstRate: 18 },

  // Insulation materials
  { hsnCode: "6806", description: "Slag wool, rock wool and similar mineral wools, expanded minerals", gstRate: 18 },
  { hsnCode: "68061000", description: "Slag wool, rock wool and similar mineral wools", gstRate: 18 },
  { hsnCode: "68062000", description: "Expanded clay, foamed slag and similar expanded materials", gstRate: 18 },
  { hsnCode: "3921", description: "Other plates, sheets, film, foil and strip of plastics — cellular", gstRate: 18 },

  // Vitrified tiles, granite slabs
  { hsnCode: "6907", description: "Unglazed ceramic flags and paving tiles, hearth tiles", gstRate: 5 },
  { hsnCode: "6908", description: "Glazed ceramic flags and paving tiles, hearth tiles", gstRate: 5 },
  { hsnCode: "6810", description: "Articles of cement, concrete or artificial stone (general)", gstRate: 18 },

  // Door fittings, hinges
  { hsnCode: "83021000", description: "Hinges of base metal (for doors, windows, furniture)", gstRate: 18 },
  { hsnCode: "83024100", description: "Base metal mountings and fittings for buildings", gstRate: 18 },

  // Water tanks, storage
  { hsnCode: "7310", description: "Tanks, casks, drums, cans (iron/steel) — capacity <300L", gstRate: 18 },
  { hsnCode: "73110000", description: "Containers for compressed/liquefied gas (iron/steel)", gstRate: 18 },

  // Geotextiles, tarpaulins
  { hsnCode: "5903", description: "Textile fabrics impregnated, coated, covered with plastics", gstRate: 18 },
  { hsnCode: "6306", description: "Tarpaulins, awnings, sunblinds, tents (textile)", gstRate: 18 },

  // Welding rods, electrodes
  { hsnCode: "8311", description: "Wire, rods, tubes, plates, electrodes of base metal for welding", gstRate: 18 },
  { hsnCode: "83111000", description: "Wire of base metal coated with flux for welding", gstRate: 18 },
  { hsnCode: "83113000", description: "Coated electrodes for arc welding", gstRate: 18 },

  // Diesel/petrol (for construction equipment)
  { hsnCode: "27101110", description: "Motor spirit (petrol)", gstRate: 28 },
  { hsnCode: "27101940", description: "Light diesel oil (LDO)", gstRate: 18 },
  { hsnCode: "27101960", description: "High speed diesel oil (HSD)", gstRate: 18 },

  // Bricks — fly ash, AAC
  { hsnCode: "68101190", description: "Fly ash bricks and blocks", gstRate: 18 },
  { hsnCode: "68101920", description: "Autoclaved aerated concrete (AAC) blocks", gstRate: 18 },

  // Construction SAC codes — detailed sub-codes
  { hsnCode: "995411", description: "Construction services of single dwelling or multi dwelling buildings", gstRate: 18, category: "Services", sacCode: "995411" },
  { hsnCode: "995412", description: "Construction services of industrial buildings", gstRate: 18, category: "Services", sacCode: "995412" },
  { hsnCode: "995413", description: "Construction services of non-residential buildings", gstRate: 18, category: "Services", sacCode: "995413" },
  { hsnCode: "995421", description: "General construction services of highways, streets, roads", gstRate: 18, category: "Services", sacCode: "995421" },
  { hsnCode: "995423", description: "General construction services of bridges and tunnels", gstRate: 18, category: "Services", sacCode: "995423" },
  { hsnCode: "995424", description: "General construction services of dams, waterways", gstRate: 18, category: "Services", sacCode: "995424" },
  { hsnCode: "995441", description: "Specialized construction services of foundations", gstRate: 18, category: "Services", sacCode: "995441" },
  { hsnCode: "995451", description: "Plumbing and drain-laying services", gstRate: 18, category: "Services", sacCode: "995451" },
  { hsnCode: "995452", description: "Electrical wiring services", gstRate: 18, category: "Services", sacCode: "995452" },
  { hsnCode: "995461", description: "Concrete work services", gstRate: 18, category: "Services", sacCode: "995461" },
  { hsnCode: "995462", description: "Steel reinforcement work services", gstRate: 18, category: "Services", sacCode: "995462" },
  { hsnCode: "995463", description: "Masonry services", gstRate: 18, category: "Services", sacCode: "995463" },
  { hsnCode: "995464", description: "Carpentry services", gstRate: 18, category: "Services", sacCode: "995464" },
  { hsnCode: "995465", description: "Tiling and flooring services", gstRate: 18, category: "Services", sacCode: "995465" },
  { hsnCode: "995466", description: "Glazing services", gstRate: 18, category: "Services", sacCode: "995466" },
  { hsnCode: "995467", description: "Plastering services", gstRate: 18, category: "Services", sacCode: "995467" },
  { hsnCode: "995468", description: "Painting services", gstRate: 18, category: "Services", sacCode: "995468" },
  { hsnCode: "995471", description: "Scaffolding services", gstRate: 18, category: "Services", sacCode: "995471" },
  { hsnCode: "995473", description: "Building site preparation services", gstRate: 18, category: "Services", sacCode: "995473" },
  { hsnCode: "995482", description: "Installation services of elevators/escalators", gstRate: 18, category: "Services", sacCode: "995482" },
  { hsnCode: "995483", description: "Installation services of air-conditioning", gstRate: 18, category: "Services", sacCode: "995483" },
  { hsnCode: "995494", description: "Specialized repair services of buildings", gstRate: 18, category: "Services", sacCode: "995494" },
  { hsnCode: "997213", description: "Real estate property management services", gstRate: 18, category: "Services", sacCode: "997213" },
  { hsnCode: "997214", description: "Real estate valuation services", gstRate: 18, category: "Services", sacCode: "997214" },
  { hsnCode: "997215", description: "Real estate consulting services", gstRate: 18, category: "Services", sacCode: "997215" },

  // Transport/logistics services
  { hsnCode: "996511", description: "Transport of goods by road — full truck load (FTL)", gstRate: 18, category: "Services", sacCode: "996511" },
  { hsnCode: "996512", description: "Transport of goods by road — less than truck load (LTL)", gstRate: 18, category: "Services", sacCode: "996512" },
  { hsnCode: "996531", description: "Transport of goods by rail", gstRate: 0, category: "Services", sacCode: "996531" },

  // Professional services
  { hsnCode: "997211", description: "Real estate services involving sale/rent of own/leased property", gstRate: 18, category: "Services", sacCode: "997211" },
  { hsnCode: "998311", description: "Engineering design services", gstRate: 18, category: "Services", sacCode: "998311" },
  { hsnCode: "998312", description: "Engineering advisory and consultancy services", gstRate: 18, category: "Services", sacCode: "998312" },
  { hsnCode: "998314", description: "Architectural services", gstRate: 18, category: "Services", sacCode: "998314" },
  { hsnCode: "998315", description: "Architectural advisory and consultancy services", gstRate: 18, category: "Services", sacCode: "998315" },
  { hsnCode: "998341", description: "Surveying services (land, topographical, hydrographic)", gstRate: 18, category: "Services", sacCode: "998341" },
  { hsnCode: "998342", description: "Cartography and spatial mapping services", gstRate: 18, category: "Services", sacCode: "998342" },
  { hsnCode: "998511", description: "Security services (guard, patrol, surveillance)", gstRate: 18, category: "Services", sacCode: "998511" },
  { hsnCode: "998512", description: "Detective agency services", gstRate: 18, category: "Services", sacCode: "998512" },
  { hsnCode: "998521", description: "Packaging services", gstRate: 18, category: "Services", sacCode: "998521" },
  { hsnCode: "998531", description: "Travel agency and tour operator services", gstRate: 18, category: "Services", sacCode: "998531" },
];

/**
 * Seed the HsnGstRate table with the curated construction-industry master.
 * Idempotent — upserts by hsnCode, so re-running updates descriptions/rates.
 */
export async function seedHsnGstRates(): Promise<{ created: number; updated: number }> {
  let created = 0;
  for (const entry of CONSTRUCTION_HSN_MASTER) {
    const result = await prisma.hsnGstRate.upsert({
      where: { hsnCode: entry.hsnCode },
      create: {
        hsnCode: entry.hsnCode,
        description: entry.description,
        gstRate: new Decimal(entry.gstRate),
        sacCode: entry.sacCode ?? null,
        category: entry.category ?? "Goods",
      },
      update: {
        description: entry.description,
        gstRate: new Decimal(entry.gstRate),
        sacCode: entry.sacCode ?? null,
        category: entry.category ?? "Goods",
      },
    });
    // Prisma upsert doesn't tell us if it was create or update — approximate
    // by checking if the row was recently created. For simplicity, we just
    // count total processed.
    void result;
    created++;
  }
  return { created, updated: 0 };
}

/**
 * Look up the GST rate for a given HSN code.
 * Returns null if the HSN code is not in the master.
 */
export async function lookupGstByHsn(hsnCode: string): Promise<{
  gstRate: Decimal;
  description: string;
  sacCode: string | null;
  category: string | null;
} | null> {
  const entry = await prisma.hsnGstRate.findUnique({
    where: { hsnCode: hsnCode.trim().toUpperCase() },
  });
  if (!entry) return null;
  return {
    gstRate: entry.gstRate,
    description: entry.description,
    sacCode: entry.sacCode,
    category: entry.category,
  };
}

/**
 * Construction-industry synonym map — maps trade names and abbreviations
 * to the canonical terms used in HSN descriptions. This dramatically
 * improves auto-detection for common Indian construction jargon.
 *
 * Example: "TMT" → "steel bars", "wooden" → "wood", "copper wire" → "insulated wire"
 */
const MATERIAL_SYNONYMS: Record<string, string[]> = {
  tmt: ["steel", "bars", "rods"],
  rebar: ["steel", "bars", "rods"],
  reinforcement: ["steel", "bars"],
  wooden: ["wood"],
  timber: ["wood"],
  plywood: ["plywood", "wood"],
  "copper wire": ["insulated wire", "cable"],
  "copper cable": ["insulated cable", "wire"],
  opc: ["portland cement"],
  ppc: ["portland cement"],
  cement: ["portland cement"],
  concrete: ["cement", "concrete"],
  "red brick": ["bricks", "ceramic"],
  "fly ash": ["fly ash", "bricks"],
  aac: ["autoclaved aerated concrete"],
  block: ["blocks", "bricks"],
  "pvc pipe": ["pvc", "tubes", "pipes"],
  "cpvc pipe": ["cpvc", "tubes", "pipes"],
  conduit: ["tubes", "pipes"],
  paint: ["paints", "varnishes"],
  enamel: ["paints", "varnishes"],
  putty: ["putty", "plaster"],
  marble: ["marble", "stone"],
  granite: ["granite", "stone"],
  tile: ["tiles", "ceramic"],
  "marble tile": ["marble", "tiles"],
  "granite tile": ["granite", "tiles"],
  "wall paint": ["paints", "varnishes"],
  waterproofing: ["waterproofing", "bituminous"],
  "water proofing": ["waterproofing", "bituminous"],
  adhesive: ["adhesives", "glues"],
  "tile adhesive": ["adhesives", "glues"],
  glue: ["glues", "adhesives"],
  shuttering: ["plywood", "wood"],
  centering: ["plywood", "wood"],
  scaffolding: ["scaffolding", "structures"],
  "expansion joint": ["sealants", "mastics"],
  aggregate: ["gravel", "crushed stone", "pebbles"],
  "crusher dust": ["powder", "stone"],
  "m-sand": ["sand"],
  "manufactured sand": ["sand"],
  "river sand": ["sand"],
  "steel rod": ["steel", "bars", "rods"],
  "steel bar": ["steel", "bars", "rods"],
  "steel plate": ["steel", "plates", "flat-rolled"],
  "steel sheet": ["steel", "sheets", "flat-rolled"],
  "ms pipe": ["tubes", "pipes", "iron", "steel"],
  "gi pipe": ["tubes", "pipes", "iron", "steel"],
  "steel pipe": ["tubes", "pipes", "iron", "steel"],
  "iron pipe": ["tubes", "pipes", "iron", "steel"],
  nail: ["nails", "fasteners"],
  bolt: ["bolts", "screws", "fasteners"],
  screw: ["screws", "fasteners"],
  nut: ["nuts", "fasteners"],
  washer: ["washers", "fasteners"],
  rivet: ["rivets", "fasteners"],
  hinge: ["hinges", "fittings", "mountings"],
  lock: ["locks", "padlocks"],
  "safety helmet": ["headgear", "helmets"],
  "safety boots": ["footwear", "boots"],
  "safety vest": ["vests", "knitted"],
  diesel: ["diesel", "oils"],
  petrol: ["motor spirit", "petrol"],
  "welding rod": ["welding", "wire", "electrodes"],
  electrode: ["electrodes", "welding"],
  "sand paper": ["abrasive", "sandpaper"],
  sandpaper: ["abrasive", "sandpaper"],
  glass: ["glass", "float"],
  "window glass": ["glass", "float"],
  "door frame": ["doors", "frames", "joinery"],
  "window frame": ["windows", "frames", "joinery"],
  "steel door": ["doors", "frames", "iron", "steel"],
  "steel window": ["windows", "frames", "iron", "steel"],
  "wooden door": ["doors", "frames", "wood", "joinery"],
  "wooden window": ["windows", "frames", "wood", "joinery"],
  "sanitary ware": ["sanitary", "sinks", "basins"],
  "wc pan": ["toilet", "sanitary", "ceramic"],
  "wash basin": ["basins", "sinks", "sanitary"],
  "water tank": ["tanks", "casks", "drums"],
  "solar panel": ["solar", "photovoltaic"],
  inverter: ["static converters", "rectifiers"],
  "circuit breaker": ["switching", "protecting", "circuits"],
  switch: ["switching", "electrical"],
  socket: ["plugs", "sockets"],
  "led light": ["lamps", "lighting"],
  "street light": ["lamps", "lighting"],
  "led bulb": ["lamps", "lighting"],
  pump: ["pumps", "liquids"],
  "centrifugal pump": ["pumps", "centrifugal"],
  "diesel pump": ["pumps", "liquids"],
  crane: ["lifting", "cranes", "hoists"],
  hoist: ["lifting", "hoists"],
  "concrete mixer": ["mixing", "machinery"],
  vibrator: ["vibrating", "machinery"],
  excavator: ["excavators", "shovels"],
  "jcb": ["excavators", "shovels"],
  "dumper": ["dumpers", "bulldozers"],
  "bitumen": ["bituminous", "asphalt"],
  "tar": ["bituminous", "asphalt"],
  "gypsum board": ["plaster", "gypsum"],
  "pop": ["plaster", "gypsum"],
  "plaster of paris": ["plaster", "gypsum"],
  "false ceiling": ["plaster", "gypsum", "ceiling"],
  insulation: ["insulation", "mineral wool", "slag wool"],
  "thermocol": ["plastics", "cellular", "sheets"],
  "geotextile": ["textile", "fabrics", "coated"],
  tarpaulin: ["tarpaulins", "awnings", "tents"],
  "barbed wire": ["wire", "barbed"],
  "chain link": ["chain", "fencing"],
  fence: ["fencing", "railing"],
  "rcc": ["cement", "concrete", "reinforcement"],
  "rcc pipe": ["tubes", "pipes", "cement", "concrete"],
  "hume pipe": ["tubes", "pipes", "cement", "concrete"],
  "manhole cover": ["covers", "frames", "iron", "steel"],
  "drain cover": ["covers", "frames", "iron", "steel"],
};

/**
 * Expand a material name with synonyms. Returns the original words plus
 * any synonym expansions, deduplicated.
 */
function expandWithSynonyms(name: string): string[] {
  const lower = name.toLowerCase().trim();
  const words = lower.split(/\s+/).filter((w) => w.length >= 2);
  const expanded = new Set<string>();

  for (const w of words) {
    if (w.length >= 3) expanded.add(w);
  }

  // Check multi-word synonyms (e.g., "copper wire", "pvc pipe")
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 3, words.length); j++) {
      const phrase = words.slice(i, j).join(" ");
      const syns = MATERIAL_SYNONYMS[phrase];
      if (syns) {
        for (const s of syns) {
          for (const sw of s.split(/\s+/)) {
            if (sw.length >= 3) expanded.add(sw);
          }
        }
      }
    }
  }

  // Check single-word synonyms
  for (const w of words) {
    const syns = MATERIAL_SYNONYMS[w];
    if (syns) {
      for (const s of syns) {
        for (const sw of s.split(/\s+/)) {
          if (sw.length >= 3) expanded.add(sw);
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Suggest HSN codes by matching against the material name and category.
 * Uses synonym expansion for construction-industry trade names and
 * category-aware scoring to improve match accuracy.
 *
 * Returns the top N matches sorted by relevance.
 */
export async function suggestHsnByMaterial(
  materialName: string,
  categoryName?: string | null,
  limit = 5,
): Promise<{
  hsnCode: string;
  description: string;
  gstRate: Decimal;
  category: string | null;
}[]> {
  const query = materialName.trim().toLowerCase();
  if (!query) return [];

  // Expand with synonyms — this handles trade names like "TMT", "OPC",
  // "wooden door", "copper wire", etc.
  const words = expandWithSynonyms(materialName);
  if (words.length === 0) return [];

  // Build OR conditions for each word against the description field.
  const orConditions = words.map((w) => ({
    description: { contains: w, mode: "insensitive" as const },
  }));

  // Also match against category name if provided.
  let catWords: string[] = [];
  if (categoryName) {
    catWords = categoryName.trim().toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    for (const cw of catWords) {
      orConditions.push({
        description: { contains: cw, mode: "insensitive" as const },
      });
    }
  }

  const entries = await prisma.hsnGstRate.findMany({
    where: { OR: orConditions },
    take: limit * 5, // over-fetch for client-side ranking
    orderBy: { hsnCode: "asc" },
  });

  // Rank with category-aware scoring:
  //   +10 for each material-name word in description
  //   +5  if description starts with that word
  //   +8  for each category word in description (boosts category-relevant matches)
  //   +3  bonus if both material word AND category word match (synergy)
  const ranked = entries
    .map((e) => {
      const desc = e.description.toLowerCase();
      let score = 0;
      let materialMatches = 0;
      let categoryMatches = 0;

      for (const w of words) {
        if (desc.includes(w)) {
          score += 10;
          materialMatches++;
        }
        if (desc.startsWith(w)) score += 5;
      }

      for (const cw of catWords) {
        if (desc.includes(cw)) {
          score += 8;
          categoryMatches++;
        }
      }

      // Synergy bonus — when both material and category words match,
      // this entry is likely more relevant
      if (materialMatches > 0 && categoryMatches > 0) {
        score += 3 * Math.min(materialMatches, categoryMatches);
      }

      return { entry: e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map((r) => ({
    hsnCode: r.entry.hsnCode,
    description: r.entry.description,
    gstRate: r.entry.gstRate,
    category: r.entry.category,
  }));
}

/**
 * Search the HSN master by code or description (for the HSN picker UI).
 */
export async function searchHsnGst(query: string, limit = 20): Promise<{
  hsnCode: string;
  description: string;
  gstRate: Decimal;
  sacCode: string | null;
  category: string | null;
}[]> {
  const q = query.trim();
  if (!q) {
    return (await prisma.hsnGstRate.findMany({
      take: limit,
      orderBy: { hsnCode: "asc" },
    })).map((e) => ({
      hsnCode: e.hsnCode,
      description: e.description,
      gstRate: e.gstRate,
      sacCode: e.sacCode,
      category: e.category,
    }));
  }
  const entries = await prisma.hsnGstRate.findMany({
    where: {
      OR: [
        { hsnCode: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { hsnCode: "asc" },
  });
  return entries.map((e) => ({
    hsnCode: e.hsnCode,
    description: e.description,
    gstRate: e.gstRate,
    sacCode: e.sacCode,
    category: e.category,
  }));
}
