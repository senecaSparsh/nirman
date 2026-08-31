/**
 * HSN/SAC Auto-Fetch Service (D24).
 *
 * Provides pluggable providers to look up HSN (goods) and SAC (services)
 * classification codes and their applicable GST rates. The CBIC provider
 * uses the free, public CBIC GST portal data; the FastGST provider uses
 * a third-party REST API with fuzzy search.
 *
 * Used by the material form and supplier invoice form to auto-fill the
 * HSN/SAC code and GST rate, eliminating manual entry.
 */

import { ServiceError } from "./errors";

// ── Types ───────────────────────────────────────────────────

export interface HsnSacResult {
  /** The HSN code (goods) or SAC code (services). */
  code: string;
  /** Official description of the code. */
  description: string;
  /** GST rate as a percentage (e.g. 18 for 18%). */
  gstRate: number;
  /** Compensation cess as a percentage, if any. */
  cessRate?: number;
  /** Whether this is HSN (goods) or SAC (services). */
  type: "HSN" | "SAC";
  /** Full classification hierarchy (chapter → heading → sub-heading → tariff). */
  hierarchy?: string[];
}

export interface HsnSacProvider {
  /** Search for HSN codes by keyword (goods). */
  searchHsn(query: string): Promise<HsnSacResult[]>;
  /** Search for SAC codes by keyword (services). */
  searchSac(query: string): Promise<HsnSacResult[]>;
  /** Get details for a specific HSN/SAC code. */
  lookupCode(code: string): Promise<HsnSacResult | null>;
}

// ── CBIC Provider (free, government portal) ─────────────────

/**
 * CBIC HSN/SAC Provider — uses the publicly available GST rate data
 * from cbic-gst.gov.in. No API key required.
 *
 * The CBIC portal doesn't expose a clean REST API, so this provider
 * uses an embedded snapshot of common construction-industry HSN/SAC
 * codes. For a full fuzzy-search experience, use the FastGST provider.
 */
export class CbicHsnSacProvider implements HsnSacProvider {
  async searchHsn(query: string): Promise<HsnSacResult[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return CONSTRUCTION_HSN_SNAPSHOT.filter(
      (r) =>
        r.type === "HSN" &&
        (r.description.toLowerCase().includes(q) || r.code.includes(q)),
    ).slice(0, 20);
  }

  async searchSac(query: string): Promise<HsnSacResult[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return CONSTRUCTION_HSN_SNAPSHOT.filter(
      (r) =>
        r.type === "SAC" &&
        (r.description.toLowerCase().includes(q) || r.code.includes(q)),
    ).slice(0, 20);
  }

  async lookupCode(code: string): Promise<HsnSacResult | null> {
    return CONSTRUCTION_HSN_SNAPSHOT.find((r) => r.code === code) ?? null;
  }
}

// ── FastGST Provider (third-party API) ──────────────────────

export interface FastGstConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * FastGST HSN/SAC Provider — uses the FastGST REST API for fuzzy search
 * and full classification hierarchy. Requires an API key from consoleDesk.in.
 */
export class FastGstHsnSacProvider implements HsnSacProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: FastGstConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  async searchHsn(query: string): Promise<HsnSacResult[]> {
    if (!query.trim()) return [];
    const res = await fetch(`${this.baseUrl}/search/hsn?query=${encodeURIComponent(query)}`, {
      headers: { "X-API-Key": this.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new ServiceError(`FastGST HSN search failed: ${res.status}`, res.status as 400 | 500);
    const data = (await res.json()) as FastGstSearchResponse[];
    return data.map(this.mapFastGstResult("HSN"));
  }

  async searchSac(query: string): Promise<HsnSacResult[]> {
    if (!query.trim()) return [];
    const res = await fetch(`${this.baseUrl}/search/sac?query=${encodeURIComponent(query)}`, {
      headers: { "X-API-Key": this.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new ServiceError(`FastGST SAC search failed: ${res.status}`, res.status as 400 | 500);
    const data = (await res.json()) as FastGstSearchResponse[];
    return data.map(this.mapFastGstResult("SAC"));
  }

  async lookupCode(code: string): Promise<HsnSacResult | null> {
    const type = code.length <= 6 ? "SAC" : "HSN";
    const endpoint = type === "SAC" ? "sac" : "hsn";
    const res = await fetch(`${this.baseUrl}/search/${endpoint}/${encodeURIComponent(code)}/taxes`, {
      headers: { "X-API-Key": this.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ServiceError(`FastGST lookup failed: ${res.status}`, res.status as 400 | 500);
    const data = (await res.json()) as FastGstTaxResponse;
    return {
      code: data.code,
      description: data.description,
      gstRate: Number(data.cgst_rate) + Number(data.sgst_rate),
      cessRate: data.compensation_cess ? Number(data.compensation_cess) : undefined,
      type,
      hierarchy: data.hierarchy,
    };
  }

  private mapFastGstResult(type: "HSN" | "SAC") {
    return (item: FastGstSearchResponse): HsnSacResult => ({
      code: item.code,
      description: item.description,
      gstRate: Number(item.gst_rate) || 0,
      cessRate: item.cess ? Number(item.cess) : undefined,
      type,
      hierarchy: item.hierarchy,
    });
  }
}

// ── FastGST API response types ──────────────────────────────

interface FastGstSearchResponse {
  code: string;
  description: string;
  gst_rate?: string | number;
  cess?: string | number;
  hierarchy?: string[];
}

interface FastGstTaxResponse {
  code: string;
  description: string;
  cgst_rate: string | number;
  sgst_rate: string | number;
  igst_rate: string | number;
  compensation_cess?: string | number;
  hierarchy?: string[];
}

// ── Embedded HSN/SAC snapshot (construction industry) ───────
//
// A curated subset of HSN and SAC codes most relevant to construction
// and real estate. Used by the free CBIC provider. For full coverage,
// configure the FastGST integration.

const CONSTRUCTION_HSN_SNAPSHOT: HsnSacResult[] = [
  // ── HSN — Goods (construction materials) ──
  { code: "2517", description: "Pebbles, gravel, crushed stone, macadam; flint, waste/sludge gravel", gstRate: 5, type: "HSN" },
  { code: "25171010", description: "Limestone for building (crushed stone)", gstRate: 5, type: "HSN" },
  { code: "25171020", description: "Sand for building", gstRate: 5, type: "HSN" },
  { code: "25171090", description: "Other crushed/granite stone for building", gstRate: 5, type: "HSN" },
  { code: "2523", description: "Portland cement, aluminous cement, slag cement, hydraulic cement", gstRate: 28, type: "HSN" },
  { code: "25232900", description: "Other Portland cement", gstRate: 28, type: "HSN" },
  { code: "6810", description: "Articles of cement, concrete or artificial stone (blocks, bricks, tiles)", gstRate: 18, type: "HSN" },
  { code: "68109900", description: "Other articles of cement/concrete (pipes, slabs, beams)", gstRate: 18, type: "HSN" },
  { code: "7308", description: "Structures and parts of structures (iron/steel); doors, windows, frames", gstRate: 18, type: "HSN" },
  { code: "73083000", description: "Doors, windows and their frames (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "7213", description: "Wire rod of iron/non-alloy steel — hot-rolled", gstRate: 18, type: "HSN" },
  { code: "72139100", description: "Wire rod — free cutting steel", gstRate: 18, type: "HSN" },
  { code: "7214", description: "Bars and rods of iron/non-alloy steel — hot-rolled", gstRate: 18, type: "HSN" },
  { code: "72142090", description: "Other bars and rods (iron/steel) — hot-rolled", gstRate: 18, type: "HSN" },
  { code: "7208", description: "Flat-rolled products of iron/non-alloy steel — hot-rolled, wide", gstRate: 18, type: "HSN" },
  { code: "72085100", description: "Hot-rolled steel plates — width ≥600mm, thickness >10mm", gstRate: 18, type: "HSN" },
  { code: "7225", description: "Flat-rolled products of alloy/other steel — width ≥600mm", gstRate: 18, type: "HSN" },
  { code: "6901", description: "Bricks, blocks, tiles and other ceramic goods of siliceous fossil meals", gstRate: 5, type: "HSN" },
  { code: "6902", description: "Refractory bricks, blocks, tiles (siliceous earth/meal)", gstRate: 5, type: "HSN" },
  { code: "6910", description: "Ceramic sinks, wash basins, WC pans, baths (building ceramics)", gstRate: 18, type: "HSN" },
  { code: "69149000", description: "Other ceramic articles", gstRate: 18, type: "HSN" },
  { code: "3208", description: "Paints and varnishes (incl. enamels, lacquers); based on polymers", gstRate: 18, type: "HSN" },
  { code: "32081010", description: "Paints based on acrylic/vinyl polymers", gstRate: 18, type: "HSN" },
  { code: "32089020", description: "Other paints and enamels (polymer based)", gstRate: 18, type: "HSN" },
  { code: "3214", description: "Plaster, putty, mastics, surfacing preparations", gstRate: 28, type: "HSN" },
  { code: "32141000", description: "Plaster, putty, mastic — fillers/stopper", gstRate: 28, type: "HSN" },
  { code: "6807", description: "Prepared bituminous roofing/waterproofing products (sheets, strips)", gstRate: 18, type: "HSN" },
  { code: "6808", description: "Panels, boards, tiles, blocks of vegetable fiber (strawboard, etc.)", gstRate: 12, type: "HSN" },
  { code: "6811", description: "Articles of asbestos-cement, cellulose fiber-cement", gstRate: 18, type: "HSN" },
  { code: "6812", description: "Fabricated asbestos fibers; mixtures; articles", gstRate: 18, type: "HSN" },
  { code: "7310", description: "Tanks, casks, drums, cans (iron/steel) — capacity <300L", gstRate: 18, type: "HSN" },
  { code: "7318", description: "Screws, bolts, nuts, washers, rivets (iron/steel fasteners)", gstRate: 18, type: "HSN" },
  { code: "73181500", description: "Screws — other (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "73181600", description: "Nuts (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "73182100", description: "Spring washers (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "73182400", description: "Cotter pins and split pins (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "8413", description: "Pumps for liquids, liquid elevators; parts thereof", gstRate: 18, type: "HSN" },
  { code: "84137010", description: "Pumps — centrifugal (for liquids)", gstRate: 18, type: "HSN" },
  { code: "8501", description: "Electric motors and generators", gstRate: 18, type: "HSN" },
  { code: "85011000", description: "Universal AC/DC micro-motors (<37.5W)", gstRate: 18, type: "HSN" },
  { code: "8504", description: "Electrical transformers, static converters, rectifiers", gstRate: 18, type: "HSN" },
  { code: "85044000", description: "Static converters (rectifiers, inverters)", gstRate: 18, type: "HSN" },
  { code: "8536", description: "Electrical apparatus for switching/protection circuits (<1000V)", gstRate: 18, type: "HSN" },
  { code: "85361000", description: "Fuses (electrical, <1000V)", gstRate: 18, type: "HSN" },
  { code: "85366900", description: "Plugs and sockets (<1000V)", gstRate: 18, type: "HSN" },
  { code: "8544", description: "Insulated wire, cable; optical fiber cables", gstRate: 18, type: "HSN" },
  { code: "85444290", description: "Other insulated electric conductors (with connectors, ≤1000V)", gstRate: 18, type: "HSN" },
  { code: "7304", description: "Tubes, pipes, hollow profiles (iron/steel — seamless)", gstRate: 18, type: "HSN" },
  { code: "7306", description: "Other tubes, pipes, hollow profiles (iron/steel — welded)", gstRate: 18, type: "HSN" },
  { code: "73063000", description: "Welded tubes — circular cross-section (iron/steel)", gstRate: 18, type: "HSN" },
  { code: "3917", description: "Tubes, pipes, hoses (plastics) and fittings thereof", gstRate: 18, type: "HSN" },
  { code: "39172300", description: "Rigid PVC tubes/pipes", gstRate: 18, type: "HSN" },
  { code: "3925", description: "Building materials (plastics) — doors, windows, fittings", gstRate: 18, type: "HSN" },
  { code: "39251000", description: "Doors, windows, frames, thresholds (plastics)", gstRate: 18, type: "HSN" },
  { code: "39252000", description: "Fittings for buildings (plastics — sinks, wash basins)", gstRate: 18, type: "HSN" },
  { code: "39269000", description: "Other articles of plastics", gstRate: 18, type: "HSN" },
  { code: "4814", description: "Wallpaper and similar wallcoverings (paper)", gstRate: 12, type: "HSN" },
  { code: "48141000", description: "Wallpaper (wood pulp/vinyl coated)", gstRate: 12, type: "HSN" },
  { code: "4410", description: "Particle board, oriented strand board (OSB), similar board (wood)", gstRate: 12, type: "HSN" },
  { code: "4412", description: "Plywood, veneered panels, laminated wood", gstRate: 12, type: "HSN" },
  { code: "4418", description: "Builders' joinery and carpentry of wood (doors, frames, flooring)", gstRate: 12, type: "HSN" },
  { code: "44181000", description: "Windows, French windows, doors (wood)", gstRate: 12, type: "HSN" },
  { code: "44182000", description: "Doors and their frames, thresholds (wood)", gstRate: 12, type: "HSN" },
  { code: "44189000", description: "Other builders' carpentry of wood", gstRate: 12, type: "HSN" },
  { code: "6802", description: "Worked monumental/building stone (marble, granite, sandstone)", gstRate: 18, type: "HSN" },
  { code: "68022100", description: "Marble — worked/granite blocks/slabs", gstRate: 18, type: "HSN" },
  { code: "68022900", description: "Other worked monumental/building stone", gstRate: 18, type: "HSN" },
  { code: "6805", description: "Abrasive powder/grain on base of textile/paper (sandpaper)", gstRate: 18, type: "HSN" },
  { code: "8474", description: "Machinery for sorting, screening, crushing stone/ore", gstRate: 18, type: "HSN" },
  { code: "84741000", description: "Sorting/screening/separating machinery", gstRate: 18, type: "HSN" },
  { code: "84742090", description: "Other crushing/grinding machinery (stone/ore)", gstRate: 18, type: "HSN" },
  { code: "8428", description: "Lifting/handling machinery (cranes, hoists, lifts, escalators)", gstRate: 18, type: "HSN" },
  { code: "84281000", description: "Lifts and skip hoists", gstRate: 18, type: "HSN" },
  { code: "84282000", description: "Pneumatic elevators/conveyors", gstRate: 18, type: "HSN" },
  { code: "84283300", description: "Continuous-action elevators/conveyors — belt type", gstRate: 18, type: "HSN" },
  { code: "84283900", description: "Other continuous-action elevators/conveyors", gstRate: 18, type: "HSN" },
  { code: "8429", description: "Self-propelled bulldozers, graders, excavators, road machinery", gstRate: 18, type: "HSN" },
  { code: "84295100", description: "Front-end shovel loaders", gstRate: 18, type: "HSN" },
  { code: "84295200", description: "Mechanical shovels and excavators", gstRate: 18, type: "HSN" },
  { code: "8430", description: "Pile-drivers, extractors, boring/sinking machinery", gstRate: 18, type: "HSN" },
  { code: "84301000", description: "Pile-drivers and pile-extractors", gstRate: 18, type: "HSN" },
  { code: "84306900", description: "Other boring/sinking machinery", gstRate: 18, type: "HSN" },
  { code: "8479", description: "Machines and mechanical appliances with individual functions", gstRate: 18, type: "HSN" },
  { code: "84798990", description: "Other machines with individual functions", gstRate: 18, type: "HSN" },
  // ── SAC — Services (construction & real estate) ──
  { code: "9954", description: "Construction services", gstRate: 18, type: "SAC" },
  { code: "995411", description: "Construction services of single dwelling or multi dwelling buildings", gstRate: 18, type: "SAC" },
  { code: "995412", description: "Construction services of industrial buildings", gstRate: 18, type: "SAC" },
  { code: "995413", description: "Construction services of non-residential buildings", gstRate: 18, type: "SAC" },
  { code: "995421", description: "General construction services of highways, streets, roads", gstRate: 18, type: "SAC" },
  { code: "995422", description: "General construction services of railways", gstRate: 18, type: "SAC" },
  { code: "995423", description: "General construction services of bridges and tunnels", gstRate: 18, type: "SAC" },
  { code: "995424", description: "General construction services of dams, waterways", gstRate: 18, type: "SAC" },
  { code: "995425", description: "General construction services of long-distance pipelines", gstRate: 18, type: "SAC" },
  { code: "995426", description: "General construction services of local pipelines", gstRate: 18, type: "SAC" },
  { code: "995427", description: "General construction services of power/telecommunication lines", gstRate: 18, type: "SAC" },
  { code: "995431", description: "Erection services of prefabricated structures", gstRate: 18, type: "SAC" },
  { code: "995432", description: "Erection services of non-metallic structures", gstRate: 18, type: "SAC" },
  { code: "995441", description: "Specialized construction services of foundations", gstRate: 18, type: "SAC" },
  { code: "995442", description: "Specialized construction services of building roofs", gstRate: 18, type: "SAC" },
  { code: "995443", description: "Specialized construction services of water wells", gstRate: 18, type: "SAC" },
  { code: "995451", description: "Plumbing and drain-laying services", gstRate: 18, type: "SAC" },
  { code: "995452", description: "Electrical wiring services", gstRate: 18, type: "SAC" },
  { code: "995453", description: "Fencing and railing services", gstRate: 18, type: "SAC" },
  { code: "995461", description: "Concrete work services", gstRate: 18, type: "SAC" },
  { code: "995462", description: "Steel reinforcement work services", gstRate: 18, type: "SAC" },
  { code: "995463", description: "Masonry services", gstRate: 18, type: "SAC" },
  { code: "995464", description: "Carpentry services", gstRate: 18, type: "SAC" },
  { code: "995465", description: "Tiling and flooring services", gstRate: 18, type: "SAC" },
  { code: "995466", description: "Glazing services", gstRate: 18, type: "SAC" },
  { code: "995467", description: "Plastering services", gstRate: 18, type: "SAC" },
  { code: "995468", description: "Painting services", gstRate: 18, type: "SAC" },
  { code: "995471", description: "Scaffolding services", gstRate: 18, type: "SAC" },
  { code: "995472", description: "Building demolition services", gstRate: 18, type: "SAC" },
  { code: "995473", description: "Building site preparation services", gstRate: 18, type: "SAC" },
  { code: "995481", description: "Installation services of industrial machinery", gstRate: 18, type: "SAC" },
  { code: "995482", description: "Installation services of elevators/escalators", gstRate: 18, type: "SAC" },
  { code: "995483", description: "Installation services of air-conditioning", gstRate: 18, type: "SAC" },
  { code: "995491", description: "Specialized repair services of roads", gstRate: 18, type: "SAC" },
  { code: "995492", description: "Specialized repair services of bridges/tunnels", gstRate: 18, type: "SAC" },
  { code: "995493", description: "Specialized repair services of dams", gstRate: 18, type: "SAC" },
  { code: "995494", description: "Specialized repair services of buildings", gstRate: 18, type: "SAC" },
  { code: "9972", description: "Real estate services", gstRate: 18, type: "SAC" },
  { code: "997211", description: "Real estate services involving sale/rent of own/leased property", gstRate: 18, type: "SAC" },
  { code: "997212", description: "Real estate brokerage services", gstRate: 18, type: "SAC" },
  { code: "997213", description: "Real estate property management services", gstRate: 18, type: "SAC" },
  { code: "997214", description: "Real estate valuation services", gstRate: 18, type: "SAC" },
  { code: "997215", description: "Real estate consulting services", gstRate: 18, type: "SAC" },
  { code: "9983", description: "Engineering, scientific, and technical consulting services", gstRate: 18, type: "SAC" },
  { code: "998311", description: "Engineering design services", gstRate: 18, type: "SAC" },
  { code: "998312", description: "Architectural services", gstRate: 18, type: "SAC" },
  { code: "998313", description: "Urban planning and landscape services", gstRate: 18, type: "SAC" },
  { code: "998314", description: "Surveying services (land, topographical, hydrographic)", gstRate: 18, type: "SAC" },
  { code: "998315", description: "Cartography and spatial information services", gstRate: 18, type: "SAC" },
  { code: "998316", description: "Geological and geophysical consulting services", gstRate: 18, type: "SAC" },
  { code: "998317", description: "Other engineering services", gstRate: 18, type: "SAC" },
  { code: "9985", description: "Management, consulting, and support services", gstRate: 18, type: "SAC" },
  { code: "998551", description: "Project management services", gstRate: 18, type: "SAC" },
  { code: "998552", description: "Construction project management services", gstRate: 18, type: "SAC" },
  { code: "998559", description: "Other management consulting services", gstRate: 18, type: "SAC" },
];

// ── Convenience functions ───────────────────────────────────

/**
 * Search for HSN or SAC codes by keyword. Returns both goods and services
 * results, sorted by relevance (exact code match first, then description match).
 */
export async function searchHsnSac(
  provider: HsnSacProvider,
  query: string,
): Promise<HsnSacResult[]> {
  const [goods, services] = await Promise.all([
    provider.searchHsn(query),
    provider.searchSac(query),
  ]);
  const results = [...goods, ...services];
  // Sort: exact code match first, then by description length (shorter = more relevant)
  return results.sort((a, b) => {
    const aExact = a.code === query ? 0 : 1;
    const bExact = b.code === query ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.description.length - b.description.length;
  });
}
