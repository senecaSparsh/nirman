import { prisma } from "@nirman/db";

/**
 * Material Code Auto-Generation
 *
 * Generates a unique, human-readable material code from:
 *   {CATEGORY_PREFIX}-{GRADE}-{SEQ}
 *
 * Examples:
 *   Steel category + grade "Fe500D"     → STL-Fe500D-001
 *   Cement category + grade "OPC 53"    → CEM-OPC53-001
 *   Aggregate category + grade "20mm"   → AGG-20MM-001
 *   Hardware category + no grade        → HDW-001
 *
 * The category prefix is derived from the category name (first 3 consonants,
 * uppercased, with common mappings). The sequence is a per-prefix counter
 * padded to 3 digits.
 */

// Common category → prefix mappings for construction materials.
const KNOWN_PREFIXES: Record<string, string> = {
  steel: "STL",
  cement: "CEM",
  aggregate: "AGG",
  sand: "SND",
  brick: "BRK",
  timber: "TMB",
  wood: "TMB",
  paint: "PNT",
  electrical: "ELC",
  plumbing: "PLB",
  hardware: "HDW",
  roofing: "ROF",
  concrete: "CNC",
  reinforcement: "STL",
  formwork: "FRM",
  scaffolding: "SCF",
  safety: "SAF",
  tools: "TLS",
  welding: "WLD",
  glass: "GLS",
  doors: "DOR",
  windows: "WIN",
  tiles: "TLE",
  insulation: "INS",
  waterproofing: "WPR",
  adhesives: "ADH",
  fasteners: "FST",
};

function categoryPrefix(categoryName: string): string {
  const lower = categoryName.toLowerCase().trim();
  // Check known mappings first.
  for (const [key, prefix] of Object.entries(KNOWN_PREFIXES)) {
    if (lower.includes(key)) return prefix;
  }
  // Fallback: first 3 alpha characters, uppercased.
  const alpha = lower.replace(/[^a-z]/g, "").slice(0, 3);
  return alpha.padEnd(3, "X").toUpperCase();
}

function sanitizeGrade(grade: string | null | undefined): string {
  if (!grade) return "";
  return grade.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Generate the next unique material code for a given category + grade.
 * Scans existing codes with the same prefix to find the max sequence number.
 */
export async function generateMaterialCode(
  categoryName: string,
  grade: string | null | undefined,
): Promise<string> {
  const prefix = categoryPrefix(categoryName);
  const gradePart = sanitizeGrade(grade);

  // Build the code pattern: "STL-Fe500D-" or "CEM-"
  const codePrefix = gradePart ? `${prefix}-${gradePart}-` : `${prefix}-`;

  // Find all existing codes with this prefix to determine the next sequence.
  const existing = await prisma.material.findMany({
    where: {
      code: { startsWith: codePrefix },
      deletedAt: null,
    },
    select: { code: true },
  });

  let maxSeq = 0;
  for (const m of existing) {
    const parts = m.code.split("-");
    const lastPart = parts[parts.length - 1] ?? "";
    const seq = parseInt(lastPart, 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(3, "0");
  return `${codePrefix}${seqStr}`;
}

/**
 * Preview the material code that WOULD be generated, without creating it.
 * Used by the UI to show the user what code their material will get.
 */
export function previewMaterialCode(
  categoryName: string,
  grade: string | null | undefined,
): string {
  const prefix = categoryPrefix(categoryName);
  const gradePart = sanitizeGrade(grade);
  const codePrefix = gradePart ? `${prefix}-${gradePart}-` : `${prefix}-`;
  return `${codePrefix}???`;
}
