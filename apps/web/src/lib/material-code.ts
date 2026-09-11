/**
 * Client-side material code preview — mirrors the server-side `previewMaterialCode`
 * from @nirman/services so the UI can show the auto-generated code prefix instantly
 * without a network round-trip. The actual sequence number is assigned server-side
 * at creation time; here we only show the prefix + "???".
 */

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

export function categoryPrefix(categoryName: string): string {
  const lower = categoryName.toLowerCase().trim();
  for (const [key, prefix] of Object.entries(KNOWN_PREFIXES)) {
    if (lower.includes(key)) return prefix;
  }
  const alpha = lower.replace(/[^a-z]/g, "").slice(0, 3);
  return alpha.padEnd(3, "X").toUpperCase();
}

export function sanitizeGrade(grade: string | null | undefined): string {
  if (!grade) return "";
  return grade.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Preview the material code prefix (e.g. "STL-FE500D-???") — instant, no API call. */
export function previewMaterialCode(
  categoryName: string,
  grade: string | null | undefined,
): string {
  if (!categoryName) return "";
  const prefix = categoryPrefix(categoryName);
  const gradePart = sanitizeGrade(grade);
  const codePrefix = gradePart ? `${prefix}-${gradePart}-` : `${prefix}-`;
  return `${codePrefix}???`;
}
