export function requiresSaleAgreement(assetType: string, projectId?: string | null): boolean {
  return assetType !== "LAND" || !!projectId;
}
