import { NextRequest } from "next/server";
import { flagNrvWriteDowns } from "@nirman/services";
import { apiHandler, json, requireEffectivePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/health/nrv-sweep — run the NRV (lower-of-cost-or-NRV, IAS 2)
 * write-down sweep: posts a GL entry for each unsold unit/parcel whose
 * recorded write-down is below cost − currentValuation, and reverses the
 * write-down for assets whose NRV recovered above cost.
 *
 * Finance-only — the write-down is a valuation decision, not an accident a
 * cron should make overnight.
 */
export const POST = apiHandler(async (_req: NextRequest) => {
  await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const writeDowns = await flagNrvWriteDowns(company.id);
  return json({
    ok: true,
    writeDownsPosted: writeDowns.length,
    writeDowns: writeDowns.map((w: { type: string; id: string; writeDownAmount: { toNumber(): number } }) => ({
      type: w.type,
      id: w.id,
      amount: w.writeDownAmount.toNumber(),
    })),
  });
});
