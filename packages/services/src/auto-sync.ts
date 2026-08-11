import { prisma } from "@nirman/db";
import { getIntegrationConfig, createTallyProviderFromConfig } from "./integration-config";
import { syncEntryToTally } from "./tally";

/**
 * Auto-sync a journal entry to Tally if the company has Tally auto-sync enabled.
 *
 * This is designed to be called AFTER the main transaction commits — it runs
 * in its own separate transaction/connection. Failures are logged but don't
 * block the original operation (best-effort sync).
 *
 * Usage (inside a service function, after $transaction resolves):
 * ```
 * const result = await prisma.$transaction(async (tx) => { ... });
 * // Fire-and-forget auto-sync (don't await)
 * void autoSyncEntryToTally(companyId, journalEntryId).catch(() => {});
 * ```
 */
export async function autoSyncEntryToTally(
  companyId: string,
  journalEntryId: string,
): Promise<void> {
  try {
    const config = await getIntegrationConfig({ companyId, key: "TALLY" });
    if (!config?.enabled) return;
    if (!(config.config.autoSync as boolean)) return; // auto-sync not enabled

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    if (!company) return;

    const tallyCompanyName = (config.config.companyName as string) || company.name;
    const provider = await createTallyProviderFromConfig(companyId);

    await syncEntryToTally(journalEntryId, tallyCompanyName, provider);
  } catch (err: unknown) {
    // Best-effort — log but don't throw
    console.error(`[Auto-Tally-Sync] Failed for entry ${journalEntryId}:`, err);
  }
}

/**
 * Batch auto-sync: sync all unsynced entries for a company if auto-sync is on.
 * Useful as a periodic background job or after bulk operations.
 */
export async function autoSyncBatchToTally(companyId: string): Promise<void> {
  try {
    const config = await getIntegrationConfig({ companyId, key: "TALLY" });
    if (!config?.enabled || !(config.config.autoSync as boolean)) return;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    if (!company) return;

    const tallyCompanyName = (config.config.companyName as string) || company.name;
    const provider = await createTallyProviderFromConfig(companyId);

    // Import here to avoid circular dependency at module load
    const { syncBatchToTally } = await import("./tally");
    await syncBatchToTally(companyId, tallyCompanyName, provider);
  } catch (err: unknown) {
    console.error(`[Auto-Tally-Sync] Batch sync failed for company ${companyId}:`, err);
  }
}
