export function requiresSaleAgreement(assetType: string, projectId?: string | null): boolean {
  return assetType !== "LAND" || !!projectId;
}

/**
 * RERA Section 13 — a promoter cannot receive more than 10% of the
 * consideration before a written agreement (ATS or BBA) is executed.
 *
 * Applies only to agreement-gated assets (built units and project-linked
 * land): standalone land completes on a registered conveyance without an
 * agreement stage by policy, so the cap never attaches to it. Once either
 * agreement date is documented the cap lifts — the 10% ceiling governs
 * pre-agreement collections only, not total collections.
 */
export const RERA_PRE_AGREEMENT_CAP = "0.10";

export function advanceCapApplies(input: {
  assetType: string;
  projectId?: string | null;
  atsDate?: Date | string | null;
  bbaDate?: Date | string | null;
}): boolean {
  if (!requiresSaleAgreement(input.assetType, input.projectId)) return false;
  return !input.atsDate && !input.bbaDate;
}
