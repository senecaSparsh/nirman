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
 * Curated HSN/SAC master for the construction industry. This covers the
 * most common materials a real-estate builder procures. The full CBIC
 * master (~12,000 codes) can be loaded from a JSON file later — this seed
 * ensures the system is useful out of the box.
 */
const CONSTRUCTION_HSN_MASTER: HsnGstEntry[] = [
  // ── Cement & Lime ──
  { hsnCode: "2523", description: "Portland cement, aluminous cement, slag cement, supersulphate cement", gstRate: 28 },
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

  // ── Wood & Timber ──
  { hsnCode: "4407", description: "Wood sawn or chipped lengthwise, sliced or peeled, of thickness exceeding 6mm", gstRate: 18 },
  { hsnCode: "4408", description: "Sheets for veneering, plywood, of thickness not exceeding 6mm", gstRate: 18 },
  { hsnCode: "4410", description: "Particle board and similar board of wood or other ligneous materials", gstRate: 18 },
  { hsnCode: "4412", description: "Plywood, veneered panels and similar laminated wood", gstRate: 18 },
  { hsnCode: "4418", description: "Builders' joinery and carpentry of wood, including cellular wood panels", gstRate: 18 },
  { hsnCode: "4421", description: "Other articles of wood", gstRate: 18 },

  // ── Glass ──
  { hsnCode: "7005", description: "Glass of float and surface ground or polished, in sheets", gstRate: 18 },
  { hsnCode: "7008", description: "Multiple-walled insulating units of glass", gstRate: 18 },
  { hsnCode: "7016", description: "Paving blocks, bricks, tiles and other glass goods for building", gstRate: 28 },

  // ── Paints & Coatings ──
  { hsnCode: "3208", description: "Paints and varnishes based on synthetic polymers or chemically modified natural polymers", gstRate: 18 },
  { hsnCode: "3209", description: "Paints and varnishes based on acrylic or vinyl polymers", gstRate: 18 },
  { hsnCode: "3210", description: "Other paints and varnishes", gstRate: 18 },
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
  { hsnCode: "6808", description: "Panels, boards, tiles, blocks and similar articles of vegetable fibre", gstRate: 18 },
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
];

/**
 * Seed the HsnGstRate table with the curated construction-industry master.
 * Idempotent — upserts by hsnCode, so re-running updates descriptions/rates.
 */
export async function seedHsnGstRates(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
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
 * Suggest HSN codes by matching against the material name and category.
 * Returns the top N matches sorted by relevance (exact prefix match first,
 * then description contains match).
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

  // Try to find entries where the description contains keywords from the
  // material name. We split the material name into words and match any.
  const words = query.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  // Build OR conditions for each word against the description field.
  const orConditions = words.map((w) => ({
    description: { contains: w, mode: "insensitive" as const },
  }));

  // Also match against category name if provided.
  if (categoryName) {
    const catWords = categoryName.trim().toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    for (const cw of catWords) {
      orConditions.push({
        description: { contains: cw, mode: "insensitive" as const },
      });
    }
  }

  const entries = await prisma.hsnGstRate.findMany({
    where: { OR: orConditions },
    take: limit * 3, // over-fetch for client-side ranking
    orderBy: { hsnCode: "asc" },
  });

  // Rank: exact word match in description scores higher.
  const ranked = entries
    .map((e) => {
      const desc = e.description.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (desc.includes(w)) score += 10;
        if (desc.startsWith(w)) score += 5;
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
