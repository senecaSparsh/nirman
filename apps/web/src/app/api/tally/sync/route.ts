import { NextRequest } from "next/server";
import {
  syncBatchToTally,
  syncFromTally,
  getTallySyncStats,
  createTallyProvider,
  createTallyProviderFromConfig,
  getIntegrationConfig,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/tally/sync
 * Get Tally sync statistics for the current company.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const stats = await getTallySyncStats(company.id);
  // Also return whether Tally is configured (for UI status indicator)
  const config = await getIntegrationConfig({ companyId: company.id, key: "TALLY" });
  return json({ ...stats, configured: !!config?.enabled });
});

const syncSchema = z.object({
  direction: z.enum(["push", "pull", "both"]).default("push"),
  baseUrl: z.string().url().optional(),
});

/**
 * POST /api/tally/sync
 * Sync journal entries with Tally.
 *
 * Body: { direction: "push" | "pull" | "both", baseUrl?: string }
 * - "push" (default): export unsynced journal entries TO Tally
 * - "pull": import vouchers FROM Tally and reconcile
 * - "both": push then pull
 *
 * Uses the DB-stored Tally config if available, falls back to env vars.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const parsed = syncSchema.parse(body);

  // Try DB config first, fall back to env-based provider
  const provider = await createTallyProviderFromConfig(company.id);
  const tallyConfig = await getIntegrationConfig({ companyId: company.id, key: "TALLY" });
  const baseUrl = parsed.baseUrl
    ?? (tallyConfig?.enabled ? (tallyConfig.config.baseUrl as string) : undefined)
    ?? process.env.TALLY_BASE_URL
    ?? "http://localhost:9000";
  const tallyCompanyName = tallyConfig?.enabled
    ? (tallyConfig.config.companyName as string) ?? company.name
    : company.name;

  const result: {
    direction: string;
    push?: { total: number; synced: number; failed: number };
    pull?: { imported: number; variances: number; errors: number };
  } = { direction: parsed.direction };

  if (parsed.direction === "push" || parsed.direction === "both") {
    result.push = await syncBatchToTally(company.id, tallyCompanyName, provider);
  }

  if (parsed.direction === "pull" || parsed.direction === "both") {
    result.pull = await syncFromTally(company.id, baseUrl);
  }

  return json(result);
});
