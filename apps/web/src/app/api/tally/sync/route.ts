import { NextRequest } from "next/server";
import { syncBatchToTally, syncFromTally, getTallySyncStats, createTallyProvider } from "@nirman/services";
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
  return json(stats);
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
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const parsed = syncSchema.parse(body);
  const baseUrl = parsed.baseUrl ?? process.env.TALLY_BASE_URL ?? "http://localhost:9000";

  const result: {
    direction: string;
    push?: { total: number; synced: number; failed: number };
    pull?: { imported: number; variances: number; errors: number };
  } = { direction: parsed.direction };

  if (parsed.direction === "push" || parsed.direction === "both") {
    const provider = createTallyProvider(baseUrl);
    result.push = await syncBatchToTally(company.id, company.name, provider);
  }

  if (parsed.direction === "pull" || parsed.direction === "both") {
    result.pull = await syncFromTally(company.id, baseUrl);
  }

  return json(result);
});
