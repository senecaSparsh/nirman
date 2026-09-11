import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { withSerializableTransaction } from "./transaction";
// Single source of truth: hsn-code-package npm package
// (12,604 HSN codes + 496 SAC codes from CBIC Notification 09/2025-CT(Rate))
import hsnPkg from "hsn-code-package";
import hsnCodeData from "hsn-code-package/data/hsn_codes.json";
import gstRateData from "hsn-code-package/data/gst_rates.json";
import sacCodeData from "hsn-code-package/data/sac_codes.json";
import hsnMeta from "hsn-code-package/data/metadata.json";

/**
 * HSN / SAC Master — government-provided HSN codes with GST rates.
 *
 * The single source of truth is the `hsn-code-package` npm package
 * (12,604 HSN codes + 496 SAC codes from CBIC Notification 09/2025-CT(Rate)).
 *
 * The system auto-picks the GST rate when a material's HSN code is entered,
 * so users never have to look up the rate manually. Categories link to
 * specific HSN codes so selecting a category auto-fills the HSN + GST.
 *
 * To update rates: `pnpm update hsn-code-package` then re-seed the DB.
 * An admin can also bulk-import a CSV from gst.gov.in via /api/hsn-gst/import.
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
 * Build the HSN/SAC master entries from the hsn-code-package npm package.
 * This is the single source of truth — no curated JSON file, no hardcoded data.
 *
 * - HSN codes (Goods): 12,604 entries with GST rates from gst_rates.json
 * - SAC codes (Services): 496 entries with descriptions from sac_codes.json
 *   (SAC codes default to 18% GST — the standard rate for most construction services)
 */
function buildMasterFromPackage(): HsnGstEntry[] {
  const entries: HsnGstEntry[] = [];

  // HSN codes (Goods) — merge hsn_codes.json (descriptions) with gst_rates.json (rates)
  const descMap = new Map<string, string>();
  for (const c of hsnCodeData as { code: string; description: string }[]) {
    descMap.set(c.code, c.description);
  }
  for (const r of gstRateData as { code: string; igstRate: number }[]) {
    const description = descMap.get(r.code) ?? r.code;
    // Capitalize first letter for readability
    const desc = description.charAt(0) + description.slice(1).toLowerCase();
    entries.push({
      hsnCode: r.code,
      description: desc,
      gstRate: r.igstRate,
      category: "Goods",
      sacCode: null,
    });
  }

  // SAC codes (Services) — 496 entries, default 18% GST
  for (const s of sacCodeData as { code: string; description: string }[]) {
    const desc = s.description.charAt(0) + s.description.slice(1).toLowerCase();
    entries.push({
      hsnCode: s.code,
      description: desc,
      gstRate: 18, // Standard GST rate for services
      category: "Services",
      sacCode: s.code,
    });
  }

  return entries;
}

/**
 * Get the npm package version (for tracking when the master was last updated).
 */
export function getBundledMasterVersion(): string {
  const meta = hsnMeta as { version: string; gstRatesLastUpdated: string };
  return `hsn-code-package v${meta.version} (${meta.gstRatesLastUpdated})`;
}

/**
 * Default construction-industry material categories with their government HSN codes.
 *
 * Each category is linked to a specific HSN code from the government master
 * (hsn-code-package). The GST rate is auto-filled from the HsnGstRate table
 * by `seedDefaultCategories()` — never hardcoded.
 *
 * This is the single source of truth for the default category list. Both
 * the seed script and the company-creation hook read from here.
 *
 * Every HSN code below has been verified to exist in the government master
 * (hsn-code-package, CBIC Notification 09/2025-CT(Rate)). Never add a code
 * without verifying it against the seeded HsnGstRate table first.
 *
 * Organized by MaterialClass:
 *   RAW_MATERIAL — becomes part of the building (48 categories)
 *   TEMPORARY    — reused during construction, not part of building (2)
 *   CONSUMABLE   — consumed during construction (11)
 *   MRO          — maintenance, repair, operations supplies (18)
 */
export const DEFAULT_CATEGORIES = [
  // ── RAW_MATERIAL: Building structure & finishes ──
  { name: "Cement & Binding", unit: "BAG", class: "RAW_MATERIAL" as const, hsnCode: "25232910" },
  { name: "White Cement & Special", unit: "BAG", class: "RAW_MATERIAL" as const, hsnCode: "25232100" },
  { name: "Steel & Rebar", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "72142090" },
  { name: "Steel Structural", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "72161000" },
  { name: "Steel Sheets & Roofing", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "72107000" },
  { name: "Bricks & Blocks", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "68101110" },
  { name: "Sand & Aggregate", unit: "CFT", class: "RAW_MATERIAL" as const, hsnCode: "25051011" },
  { name: "Crushed Stone & Gravel", unit: "CFT", class: "RAW_MATERIAL" as const, hsnCode: "25171010" },
  { name: "Marble & Stone", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "25151100" },
  { name: "Granite & Stone", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "25161100" },
  { name: "Limestone & Calcareous", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "25210010" },
  { name: "Gypsum & Plaster", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "25201010" },
  { name: "Pre-cast & RMC", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "68101110" },
  { name: "Wood & Timber", unit: "CFT", class: "RAW_MATERIAL" as const, hsnCode: "44071010" },
  { name: "Plywood & Veneer", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "44081010" },
  { name: "Blockboard & MDF", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "44111110" },
  { name: "Doors & Windows", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "44182090" },
  { name: "Glass & Glazing", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "70051010" },
  { name: "Aluminum & UPVC", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "76041010" },
  { name: "Aluminum Sheets", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "76061110" },
  { name: "Flooring & Tiling", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "69071010" },
  { name: "Sanitary Fixtures", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "69101000" },
  { name: "Sanitary Ware", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "39221000" },
  { name: "Plumbing Pipes", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "39171010" },
  { name: "Steel Pipes", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "73041011" },
  { name: "Copper Pipes", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "74111000" },
  { name: "Electrical Cables", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "85441110" },
  { name: "Switchgear & Panels", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "85361010" },
  { name: "Lighting & Lamps", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "94051010" },
  { name: "LED & Lamps", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "85394100" },
  { name: "Transformers", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "85041010" },
  { name: "Batteries", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "85072000" },
  { name: "Solar & Renewable", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "85414011" },
  { name: "Paint & Finishes", unit: "LTR", class: "RAW_MATERIAL" as const, hsnCode: "32089090" },
  { name: "Distemper & Primers", unit: "LTR", class: "RAW_MATERIAL" as const, hsnCode: "32100011" },
  { name: "Putty & Mastics", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "32141000" },
  { name: "Waterproofing", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "32149010" },
  { name: "Adhesives & Sealants", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "32149010" },
  { name: "Hardware & Fittings", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "83021010" },
  { name: "Locks & Padlocks", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "83014010" },
  { name: "Fasteners & Fixings", unit: "NOS", class: "RAW_MATERIAL" as const, hsnCode: "73181110" },
  { name: "Barbed Wire & Fencing", unit: "MTR", class: "RAW_MATERIAL" as const, hsnCode: "73130010" },
  { name: "Wire Mesh", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "73141410" },
  { name: "Insulation", unit: "SQM", class: "RAW_MATERIAL" as const, hsnCode: "68061000" },
  { name: "Concrete Admixtures", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "38241000" },
  { name: "Bitumen & Tar", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "27131100" },
  { name: "Asphalt & Roadwork", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "27141000" },
  { name: "Landscaping & Garden", unit: "KG", class: "RAW_MATERIAL" as const, hsnCode: "31010010" },

  // ── TEMPORARY: Reused during construction ──
  { name: "Formwork & Scaffolding", unit: "NOS", class: "TEMPORARY" as const, hsnCode: "44181000" },
  { name: "Tarpaulin & Covers", unit: "NOS", class: "TEMPORARY" as const, hsnCode: "63061100" },

  // ── CONSUMABLE: Consumed during construction ──
  { name: "Safety Headgear", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "65061090" },
  { name: "Safety Footwear", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "64011010" },
  { name: "Safety Goggles", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "90049010" },
  { name: "Welding & Gas", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "83111000" },
  { name: "Welding Consumables", unit: "KG", class: "CONSUMABLE" as const, hsnCode: "38101010" },
  { name: "Cleaning & Housekeeping", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "34011110" },
  { name: "Paint Thinners", unit: "LTR", class: "CONSUMABLE" as const, hsnCode: "38140010" },
  { name: "Fire Safety", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "38130000" },
  { name: "First Aid & Medical", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "30065000" },
  { name: "Stationery & Office", unit: "NOS", class: "CONSUMABLE" as const, hsnCode: "48201010" },
  { name: "Diesel & Fuel", unit: "LTR", class: "CONSUMABLE" as const, hsnCode: "27101930" },

  // ── MRO: Maintenance, Repair, Operations equipment ──
  { name: "Hand Tools", unit: "NOS", class: "MRO" as const, hsnCode: "82052000" },
  { name: "Spanners & Wrenches", unit: "NOS", class: "MRO" as const, hsnCode: "82041110" },
  { name: "Saws & Blades", unit: "NOS", class: "MRO" as const, hsnCode: "82023100" },
  { name: "Pliers & Cutters", unit: "NOS", class: "MRO" as const, hsnCode: "82031000" },
  { name: "Cutting Tools", unit: "NOS", class: "MRO" as const, hsnCode: "82089010" },
  { name: "Pumps & Motors", unit: "NOS", class: "MRO" as const, hsnCode: "84131110" },
  { name: "Concrete Pumps", unit: "NOS", class: "MRO" as const, hsnCode: "84134000" },
  { name: "HVAC & Ventilation", unit: "NOS", class: "MRO" as const, hsnCode: "84158110" },
  { name: "Elevators & Lifts", unit: "NOS", class: "MRO" as const, hsnCode: "84281011" },
  { name: "Cranes & Hoists", unit: "NOS", class: "MRO" as const, hsnCode: "84261100" },
  { name: "Forklifts", unit: "NOS", class: "MRO" as const, hsnCode: "84271000" },
  { name: "Concrete Mixers", unit: "NOS", class: "MRO" as const, hsnCode: "84743110" },
  { name: "Special Machinery", unit: "NOS", class: "MRO" as const, hsnCode: "84791000" },
  { name: "Generators", unit: "NOS", class: "MRO" as const, hsnCode: "85021100" },
  { name: "Inverters & UPS", unit: "NOS", class: "MRO" as const, hsnCode: "85044010" },
  { name: "Excavators & Dozers", unit: "NOS", class: "MRO" as const, hsnCode: "84292000" },
  { name: "Dumpers & Trucks", unit: "NOS", class: "MRO" as const, hsnCode: "87041010" },
  { name: "Surveying Equipment", unit: "NOS", class: "MRO" as const, hsnCode: "90154000" },
] as const;

/**
 * Seed default material categories for a company.
 *
 * Called when a new company is created. Creates all 17 default construction
 * categories, each linked to its government HSN code with GST auto-filled
 * from the HsnGstRate master table.
 *
 * Idempotent: skips categories that already exist (by name within the company).
 * Non-throwing: logs errors but never fails the company creation.
 */
export async function seedDefaultCategories(
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<{ created: number; skipped: number }> {
  const client = tx ?? prisma;
  let created = 0;
  let skipped = 0;

  for (const cat of DEFAULT_CATEGORIES) {
    // Check if a category with this name already exists for this company
    const existing = await client.materialCategory.findUnique({
      where: { companyId_name: { companyId, name: cat.name } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Look up GST rate from the HSN master
    const hsnEntry = await lookupGstByHsn(cat.hsnCode);
    const gstRate = hsnEntry ? hsnEntry.gstRate : null;

    await client.materialCategory.create({
      data: {
        companyId,
        name: cat.name,
        unit: cat.unit,
        class: cat.class,
        hsnCode: cat.hsnCode,
        gstRate,
      },
    });
    created++;
  }

  return { created, skipped };
}

/**
 * Seed the HsnGstRate table from the hsn-code-package npm package.
 * Idempotent — upserts by hsnCode, so re-running updates descriptions/rates.
 */
export async function seedHsnGstRates(): Promise<{ created: number; updated: number }> {
  const master = buildMasterFromPackage();
  let created = 0;
  for (const entry of master) {
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
 * Relink category GST rates from the HSN master.
 *
 * After `seedHsnGstRates()` updates the `HsnGstRate` table with the latest
 * government rates, this function propagates those rates to `MaterialCategory`
 * rows so the category dropdown always shows the current GST rate.
 *
 * For each category that has an `hsnCode`:
 *   1. Look up the current GST rate from `HsnGstRate`.
 *   2. If it differs from the category's cached `gstRate`, update the category.
 *   3. Record the change in the report.
 *
 * **Non-disruptive design:**
 *   - All updates run inside a single Serializable transaction with retry,
 *     so either ALL categories are relinked or NONE are (no partial state).
 *   - Only categories whose rate actually changed are written, minimizing
 *     lock contention with concurrent user operations.
 *   - Orphaned HSN codes (not in government master) are reported but never
 *     cause a failure — the category keeps its existing rate.
 *   - The function never throws — it always returns a report. This ensures
 *     the cron job doesn't crash if one category has a bad HSN code.
 *
 * Returns a report of what changed — useful for verification after sync.
 */
export async function relinkCategoryGstRates(): Promise<{
  checked: number;
  updated: number;
  changes: { categoryId: string; categoryName: string; hsnCode: string; oldRate: number; newRate: number }[];
  orphans: { categoryId: string; categoryName: string; hsnCode: string }[];
}> {
  try {
    // ── Phase 1: Read all data (no locks held) ──
    const categories = await prisma.materialCategory.findMany({
      where: { hsnCode: { not: null }, deletedAt: null },
      select: { id: true, name: true, hsnCode: true, gstRate: true },
    });

    if (categories.length === 0) {
      return { checked: 0, updated: 0, changes: [], orphans: [] };
    }

    const hsnCodes = [...new Set(categories.map((c) => c.hsnCode!).filter(Boolean))];
    const hsnRows = await prisma.hsnGstRate.findMany({
      where: { hsnCode: { in: hsnCodes } },
      select: { hsnCode: true, gstRate: true },
    });
    const hsnMap = new Map(hsnRows.map((r) => [r.hsnCode, r.gstRate.toNumber()]));

    // ── Phase 2: Compute changes (pure, no DB) ──
    const changes: { categoryId: string; categoryName: string; hsnCode: string; oldRate: number; newRate: number }[] = [];
    const orphans: { categoryId: string; categoryName: string; hsnCode: string }[] = [];
    const updates: { id: string; gstRate: Decimal }[] = [];

    for (const cat of categories) {
      const hsnCode = cat.hsnCode!;
      const masterRate = hsnMap.get(hsnCode);
      if (masterRate == null) {
        orphans.push({ categoryId: cat.id, categoryName: cat.name, hsnCode });
        continue;
      }
      const currentRate = cat.gstRate ? cat.gstRate.toNumber() : null;
      if (currentRate !== masterRate) {
        updates.push({ id: cat.id, gstRate: new Decimal(masterRate) });
        changes.push({
          categoryId: cat.id,
          categoryName: cat.name,
          hsnCode,
          oldRate: currentRate ?? 0,
          newRate: masterRate,
        });
      }
    }

    // ── Phase 3: Apply all updates atomically ──
    if (updates.length > 0) {
      await withSerializableTransaction(async (tx) => {
        for (const u of updates) {
          await tx.materialCategory.update({
            where: { id: u.id },
            data: { gstRate: u.gstRate },
          });
        }
      });
    }

    return { checked: categories.length, updated: changes.length, changes, orphans };
  } catch (err) {
    // Never throw from relink — the cron job must not crash.
    // Return an empty report so the caller can continue.
    console.error("[relinkCategoryGstRates] failed (non-fatal):", err);
    return { checked: 0, updated: 0, changes: [], orphans: [] };
  }
}

/**
 * Parse a CBIC-format CSV string into HsnGstEntry[].
 *
 * Supports two common CBIC CSV formats:
 *   1. `hsnCode,description,gstRate` (with optional `category`,`sacCode` columns)
 *   2. `HSN Code,Description,GST Rate,Category,SAC Code` (header row, any case)
 *
 * - Skips empty rows and header rows.
 * - Trims whitespace, uppercases HSN codes.
 * - gstRate is parsed as number (handles "18%", "18.00", "0.18" → 18).
 */
export function parseHsnCsv(csvText: string): HsnGstEntry[] {
  const lines = csvText.split(/\r?\n/);
  const entries: HsnGstEntry[] = [];
  let startIndex = 0;

  // Detect and skip header row
  const firstLine = lines[0]?.toLowerCase() ?? "";
  if (firstLine.includes("hsn") && firstLine.includes("description")) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    // Simple CSV parser — handles quoted fields with commas
    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;

    const hsnCode = cols[0]?.trim().toUpperCase();
    const description = cols[1]?.trim();
    const gstRateRaw = cols[2]?.trim();
    if (!hsnCode || !description || !gstRateRaw) continue;

    let gstRate = parseFloat(gstRateRaw.replace("%", "").trim());
    if (isNaN(gstRate)) continue;
    // Handle 0.18 → 18 (if rate looks like a fraction < 1 and non-zero, multiply by 100)
    if (gstRate > 0 && gstRate < 1) gstRate = gstRate * 100;

    const category = cols[3]?.trim() || undefined;
    const sacCode = cols[4]?.trim() || undefined;

    entries.push({
      hsnCode,
      description,
      gstRate,
      category: category || (hsnCode.startsWith("99") ? "Services" : "Goods"),
      sacCode: sacCode || null,
    });
  }

  return entries;
}

/** Simple CSV line parser — handles quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Bulk-import HSN entries into the DB. Upserts by hsnCode.
 * Returns counts of created vs updated (approximate — Prisma upsert doesn't distinguish).
 */
export async function importHsnEntries(entries: HsnGstEntry[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  for (const entry of entries) {
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

  // Expand with synonyms — this handles trade names like "TMT", "OPC",
  // "wooden door", "copper wire", etc.
  const words = query ? expandWithSynonyms(materialName) : [];

  // Also match against category name if provided.
  const catWords: string[] = categoryName
    ? categoryName.trim().toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
    : [];

  // Need at least one source of search words
  if (words.length === 0 && catWords.length === 0) return [];

  // Build OR conditions for each word against the description field.
  const orConditions: { description: { contains: string; mode: "insensitive" } }[] = [
    ...words.map((w) => ({
      description: { contains: w, mode: "insensitive" as const },
    })),
    ...catWords.map((cw) => ({
      description: { contains: cw, mode: "insensitive" as const },
    })),
  ];

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
