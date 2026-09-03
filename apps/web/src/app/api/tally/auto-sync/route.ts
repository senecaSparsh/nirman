import { NextRequest } from "next/server";
import {
  syncBatchToTally,
  createTallyProviderFromConfig,
  getIntegrationConfig,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/tally/auto-sync
 *
 * Triggers auto-sync of all pending journal entries to Tally.
 * Unlike the manual push (which requires explicit direction), this
 * uses the auto-sync batch service that processes all unsynced entries.
 *
 * Requires FINANCE_MANAGE permission.
 */
export const POST = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();

  const config = await getIntegrationConfig({ companyId: company.id, key: "TALLY" });
  if (!config?.enabled) {
    return json({ error: "Tally integration is not configured. Configure it in Settings first." }, { status: 400 });
  }

  const tallyCompanyName = (config.config.companyName as string) || company.name;
  const provider = await createTallyProviderFromConfig(company.id);

  const result = await syncBatchToTally(company.id, tallyCompanyName, provider);

  return json(result);
});
