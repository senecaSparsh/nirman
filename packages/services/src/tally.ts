import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Tally ERP Integration Service.
 *
 * Generates Tally-compatible XML vouchers from the internal JournalEntry
 * + JournalLine records and sends them to Tally via a pluggable provider.
 *
 * The Tally XML import format uses an ENVELOPE structure with a
 * TALLYMESSAGE containing a VOUCHER element. Each voucher has ledger
 * entries (ALLLEDGERENTRIES.LIST) with debit/credit amounts.
 *
 * The provider is pluggable: a StubTallyProvider logs the XML and returns
 * success (for development/testing); a real HttpTallyProvider would POST
 * to Tally's HTTP API (typically http://localhost:9000).
 */

// ── Provider Interface ─────────────────────────────────────

export interface TallyProvider {
  sendVoucher(xml: string, companyName: string): Promise<TallySyncResult>;
}

export interface TallySyncResult {
  success: boolean;
  voucherNumber?: string;
  error?: string;
}

/** Stub provider — logs the XML and returns success. For development. */
export class StubTallyProvider implements TallyProvider {
  async sendVoucher(xml: string, _companyName: string): Promise<TallySyncResult> {
    console.log("[Tally Stub] Would send voucher XML:", xml.slice(0, 200) + "...");
    return { success: true, voucherNumber: `STUB-${Date.now()}` };
  }
}

/**
 * Real HTTP Tally provider — POSTs XML to Tally's HTTP API.
 *
 * Tally Prime exposes an HTTP-XML API on a configurable port (default 9000).
 * It expects a raw XML body (Content-Type: application/xml) and returns an
 * XML response containing CREATED/ERRORS counts and the assigned voucher
 * number.
 */
export class HttpTallyProvider implements TallyProvider {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = "http://localhost:9000", timeoutMs: number = 10_000) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // strip trailing slash
    this.timeoutMs = timeoutMs;
  }

  async sendVoucher(xml: string, _companyName: string): Promise<TallySyncResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
        signal: controller.signal,
      });

      if (!res.ok) {
        return { success: false, error: `Tally HTTP ${res.status}: ${res.statusText}` };
      }

      const responseText = await res.text();
      return parseTallyResponse(responseText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { success: false, error: `Tally request timed out after ${this.timeoutMs / 1000}s` };
      }
      return { success: false, error: err instanceof Error ? err.message : "Network error contacting Tally" };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send an Export request to Tally and return the raw XML response.
   * Used by the reverse-sync (Tally → Nirman) flow.
   */
  async fetchCollection(requestXml: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: requestXml,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ServiceError(`Tally HTTP ${res.status}: ${res.statusText}`, 502);
      }

      return await res.text();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ServiceError(`Tally export request timed out after ${this.timeoutMs / 1000}s`, 504);
      }
      throw new ServiceError(
        err instanceof Error ? err.message : "Network error contacting Tally",
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Parse a Tally XML response for success/failure and voucher number.
 *
 * Tally responses look like:
 *   <ENVELOPE>
 *     <BODY>
 *       <DATA>
 *         <COLLECTION> ... or <TALLYMESSAGE> ...
 *       </DATA>
 *     </BODY>
 *   </ENVELOPE>
 *
 * For import operations, Tally returns line(s) like:
 *   Created Vch No. 5 ...
 * or error messages. We also look for <VOUCHERNUMBER> tags.
 */
export function parseTallyResponse(responseXml: string): TallySyncResult {
  // Extract voucher number from <VOUCHERNUMBER>...</VOUCHERNUMBER>
  const vchMatch = responseXml.match(/<VOUCHERNUMBER>\s*([^<]+?)\s*<\/VOUCHERNUMBER>/i);
  const voucherNumber = vchMatch?.[1]?.trim() || undefined;

  // Check for explicit error indicators
  const hasErrors = /<ERRORS>\s*Yes/i.test(responseXml) ||
    /<ERROR>/i.test(responseXml) ||
    /Failed/i.test(responseXml);

  // Check for created/success indicators
  const createdMatch = responseXml.match(/<CREATED>\s*(\d+)/i);
  const createdCount = createdMatch?.[1] ? parseInt(createdMatch[1], 10) : 0;
  const hasCreated = createdCount > 0 || /Created/i.test(responseXml) || /<ACCEPTED>\s*Yes/i.test(responseXml);

  if (hasErrors && !hasCreated) {
    // Try to extract the error message
    const errorMsgMatch = responseXml.match(/<ERROR[^>]*>\s*<!\[CDATA\[(.*?)\]\]>/is) ||
      responseXml.match(/<ERROR[^>]*>\s*(.*?)<\/ERROR>/is);
    const errorMsg = errorMsgMatch?.[1]?.trim() || "Tally returned an error";
    return { success: false, error: errorMsg, voucherNumber };
  }

  if (hasCreated || voucherNumber) {
    return { success: true, voucherNumber };
  }

  // Ambiguous response — treat as success if no explicit errors
  return { success: true, voucherNumber };
}

/**
 * Factory: returns an HttpTallyProvider if TALLY_BASE_URL env is set,
 * otherwise falls back to StubTallyProvider.
 */
export function createTallyProvider(baseUrl?: string): TallyProvider {
  const url = baseUrl ?? process.env.TALLY_BASE_URL;
  if (url) {
    return new HttpTallyProvider(url);
  }
  return new StubTallyProvider();
}

// ── XML Generation ─────────────────────────────────────────

/** Map our source types to Tally voucher types */
const SOURCE_TO_VOUCHER_TYPE: Record<string, string> = {
  PO_RECEIPT: "Purchase",
  MATERIAL_ISSUE: "Journal",
  ASSET_SALE: "Sales",
  PAYMENT_RECEIVED: "Receipt",
  PROJECT_COST: "Journal",
  EXPENSE: "Payment",
  SUPPLIER_RETURN: "Credit Note",
  LAND_PURCHASE: "Purchase",
  OPENING: "Journal",
  PAYROLL: "Payment",
  MATERIAL_SALE: "Sales",
  RENOVATION_COST: "Journal",
  STOCK_TRANSFER: "Journal",
  DIRECT_PURCHASE: "Purchase",
  SCRAP_GENERATION: "Journal",
};

/** Escape XML special characters */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Format date as YYYYMMDD (Tally format) */
function tallyDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Generate Tally XML for a journal entry.
 */
export function generateTallyVoucherXml(
  entry: {
    entryNumber: string;
    entryDate: Date;
    sourceType: string;
    memo: string | null;
    companyId: string;
    totalDebit: Decimal;
    totalCredit: Decimal;
    lines: Array<{
      accountCode: string;
      accountName: string;
      debit: Decimal;
      credit: Decimal;
      memo: string | null;
    }>;
  },
  companyName: string,
): string {
  const voucherType = SOURCE_TO_VOUCHER_TYPE[entry.sourceType] ?? "Journal";
  const narration = escapeXml(entry.memo ?? entry.sourceType);
  const dateStr = tallyDate(entry.entryDate);

  const ledgerEntries = entry.lines
    .map((line) => {
      const amount = line.debit.gt(0) ? line.debit : line.credit;
      const isDeemedPositive = line.debit.gt(0); // debit = positive in Tally
      const ledgerName = escapeXml(line.accountName);
      const lineMemo = line.memo ? escapeXml(line.memo) : "";

      return `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${ledgerName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isDeemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount.toFixed(2)}</AMOUNT>
          ${lineMemo ? `<NARRATION>${lineMemo}</NARRATION>` : ""}
        </ALLLEDGERENTRIES.LIST>`;
    })
    .join("\n");

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
    <VERSION>1</VERSION>
    <TALLYTYPE>Data</TALLYTYPE>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">
          <DATE>${dateStr}</DATE>
          <NARRATION>${narration}</NARRATION>
          <VOUCHERNUMBER>${escapeXml(entry.entryNumber)}</VOUCHERNUMBER>
${ledgerEntries}
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

// ── Sync Operations ────────────────────────────────────────

/**
 * Get all unsynced journal entries for a company.
 */
export async function getUnsyncedEntries(companyId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      tallySyncLog: null,
    },
    include: {
      lines: {
        include: {
          account: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { entryDate: "asc" },
  });

  return entries;
}

/**
 * Sync a single journal entry to Tally.
 */
export async function syncEntryToTally(
  journalEntryId: string,
  companyName: string,
  provider?: TallyProvider,
) {
  const tallyProvider = provider ?? createTallyProvider();

  const entry = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: {
      lines: {
        include: {
          account: { select: { code: true, name: true } },
        },
      },
      tallySyncLog: true,
    },
  });

  if (!entry) throw new ServiceError("Journal entry not found", 404);
  if (entry.tallySyncLog?.syncStatus === "SYNCED") {
    throw new ServiceError("Entry already synced to Tally", 409);
  }

  const voucherType = SOURCE_TO_VOUCHER_TYPE[entry.sourceType] ?? "Journal";
  const xml = generateTallyVoucherXml(
    {
      entryNumber: entry.entryNumber,
      entryDate: entry.entryDate,
      sourceType: entry.sourceType,
      memo: entry.memo,
      companyId: entry.companyId,
      totalDebit: entry.totalDebit,
      totalCredit: entry.totalCredit,
      lines: entry.lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.account.name,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
      })),
    },
    companyName,
  );

  // Create or update the sync log
  const syncLog = await prisma.tallySyncLog.upsert({
    where: { journalEntryId: entry.id },
    create: {
      companyId: entry.companyId,
      journalEntryId: entry.id,
      tallyVoucherType: voucherType,
      xmlPayload: xml,
      syncStatus: "PENDING",
    },
    update: {
      xmlPayload: xml,
      syncStatus: "PENDING",
      errorMessage: null,
    },
  });

  // Send to Tally
  const result = await tallyProvider.sendVoucher(xml, companyName);

  const updated = await prisma.tallySyncLog.update({
    where: { id: syncLog.id },
    data: {
      syncStatus: result.success ? "SYNCED" : "FAILED",
      syncedAt: result.success ? new Date() : null,
      tallyVoucherNumber: result.voucherNumber ?? null,
      errorMessage: result.error ?? null,
    },
  });

  return updated;
}

/**
 * Sync all unsynced journal entries for a company to Tally.
 */
export async function syncBatchToTally(
  companyId: string,
  companyName: string,
  provider?: TallyProvider,
) {
  const entries = await getUnsyncedEntries(companyId);

  const results: Array<{
    journalEntryId: string;
    entryNumber: string;
    status: "SYNCED" | "FAILED";
    error?: string;
  }> = [];

  for (const entry of entries) {
    try {
      await syncEntryToTally(entry.id, companyName, provider);
      results.push({
        journalEntryId: entry.id,
        entryNumber: entry.entryNumber,
        status: "SYNCED",
      });
    } catch (err: unknown) {
      results.push({
        journalEntryId: entry.id,
        entryNumber: entry.entryNumber,
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const synced = results.filter((r) => r.status === "SYNCED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  return { total: entries.length, synced, failed, results };
}

/**
 * Get the Tally sync log for a company.
 */
export async function getTallySyncLog(companyId: string, status?: "PENDING" | "SYNCED" | "FAILED" | "IMPORTED" | "VARIANCE") {
  return prisma.tallySyncLog.findMany({
    where: {
      companyId,
      ...(status ? { syncStatus: status } : {}),
    },
    include: {
      journalEntry: {
        select: {
          entryNumber: true,
          entryDate: true,
          sourceType: true,
          memo: true,
          totalDebit: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Get sync statistics for a company.
 */
export async function getTallySyncStats(companyId: string) {
  const [total, synced, failed, pending, imported, variance] = await Promise.all([
    prisma.tallySyncLog.count({ where: { companyId } }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "SYNCED" } }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "FAILED" } }),
    prisma.journalEntry.count({
      where: {
        companyId,
        status: "POSTED",
        tallySyncLog: null,
      },
    }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "IMPORTED" } }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "VARIANCE" } }),
  ]);

  return { total, synced, failed, pending, imported, variance };
}

// ── Reverse Sync (Tally → Nirman) ──────────────────────────

/**
 * Build a Tally XML Export request envelope for a collection.
 *
 * Tally export requests use the same ENVELOPE structure but with
 * TALLYREQUEST = "Export Data" and a SQL-like collection query.
 */
function buildExportEnvelope(collectionName: string, filters?: Record<string, string>): string {
  const filterXml = filters
    ? Object.entries(filters)
        .map(([key, val]) => "<" + key + ">" + escapeXml(val) + "</" + key + ">")
        .join("\n        ")
    : "";

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
    <VERSION>1</VERSION>
    <TALLYTYPE>Data</TALLYTYPE>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="${escapeXml(collectionName)}Coll" ISINITIALIZE="No">
            <SOURCECOLLECTION>${escapeXml(collectionName)}</SOURCECOLLECTION>
            ${filterXml}
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
    <DATA>
      <COLLECTION NAME="${escapeXml(collectionName)}Coll">
        ${filterXml}
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Parse a simple XML tag value (first occurrence).
 */
function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

/**
 * Parse all occurrences of a repeating XML block into an array of key-value maps.
 * Each block is delimited by <TAG> ... </TAG>.
 */
function parseXmlCollection(xml: string, itemTag: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  const itemRegex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)</${itemTag}>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    if (!block) continue;
    const fields: Record<string, string> = {};

    // Extract all simple <TAG>value</TAG> pairs within the block
    const fieldRegex = /<([A-Z][A-Z0-9_.]*)>\s*([^<]*?)\s*<\/\1>/gi;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(block)) !== null) {
      const key = fieldMatch[1];
      const value = fieldMatch[2]?.trim();
      if (key && value) fields[key] = value;
    }

    if (Object.keys(fields).length > 0) {
      items.push(fields);
    }
  }

  return items;
}

/**
 * Fetch a collection (e.g. "Ledger", "Voucher", "StockItem") from Tally via
 * an Export request. Returns the parsed XML data as an array of key-value maps.
 *
 * Uses the HttpTallyProvider (or a provided provider) to send the request.
 */
export async function fetchTallyCollections(
  baseUrl: string,
  collectionName: string,
  filters?: Record<string, string>,
  provider?: TallyProvider,
): Promise<Array<Record<string, string>>> {
  const tallyProvider = provider instanceof HttpTallyProvider
    ? provider
    : new HttpTallyProvider(baseUrl);

  const requestXml = buildExportEnvelope(collectionName, filters);

  if (!(tallyProvider instanceof HttpTallyProvider)) {
    // Stub provider — return empty array
    console.log(`[Tally Stub] Would fetch collection: ${collectionName}`);
    return [];
  }

  const responseXml = await tallyProvider.fetchCollection(requestXml);

  // Tally wraps collection items in the collection name tag
  // e.g. <COLLECTION><VOUCHER>...</VOUCHER><VOUCHER>...</VOUCHER></COLLECTION>
  // Try common item tag names based on the collection
  const itemTagMap: Record<string, string> = {
    Voucher: "VOUCHER",
    Ledger: "LEDGER",
    StockItem: "STOCKITEM",
    Group: "GROUP",
    Godown: "GODOWN",
    Category: "CATEGORY",
  };

  const itemTag = itemTagMap[collectionName] ?? collectionName.toUpperCase();
  return parseXmlCollection(responseXml, itemTag);
}

/**
 * Parse a Tally voucher's amount from its ledger entries.
 * Tally vouchers contain <ALLLEDGERENTRIES.LIST> blocks with <AMOUNT> tags.
 */
function parseVoucherAmount(voucherXml: string): number | null {
  const amounts: number[] = [];
  const amountRegex = /<AMOUNT>\s*([\d.]+)\s*<\/AMOUNT>/gi;
  let match: RegExpExecArray | null;
  while ((match = amountRegex.exec(voucherXml)) !== null) {
    if (match[1]) amounts.push(parseFloat(match[1]));
  }
  if (amounts.length === 0) return null;
  // The total voucher amount is the max of the ledger entry amounts
  return Math.max(...amounts);
}

/**
 * Reverse sync — fetch vouchers from Tally and reconcile against local
 * JournalEntry records.
 *
 * For each Tally voucher:
 *  - Check if a matching JournalEntry exists (by reference/entry number)
 *  - If not found → log as IMPORTED with the raw XML
 *  - If found but different amounts → mark as VARIANCE (flag for review)
 *  - If found and matching → no action needed
 *
 * Returns a summary: { imported, variances, errors }
 */
export async function syncFromTally(
  companyId: string,
  baseUrl: string,
  provider?: TallyProvider,
): Promise<{ imported: number; variances: number; errors: number }> {
  const tallyProvider = provider ?? new HttpTallyProvider(baseUrl);
  let imported = 0;
  let variances = 0;
  let errors = 0;

  try {
    // Fetch all vouchers from Tally
    const vouchers = await fetchTallyCollections(baseUrl, "Voucher", undefined, tallyProvider);

    for (const vch of vouchers) {
      try {
        const referenceNumber = vch["VOUCHERNUMBER"] || vch["REFERENCE"] || null;
        const voucherType = vch["VCHTYPE"] || vch["VOUCHERTYPENAME"] || "Journal";
        const rawXml = `<VOUCHER>${Object.entries(vch).map(([k, val]) => `<${k}>${val}</${k}>`).join("")}</VOUCHER>`;
        const tallyAmount = parseVoucherAmount(rawXml);

        // Try to find a matching local JournalEntry by entry number
        let matchingEntry: { id: string; totalDebit: Decimal; entryNumber: string } | null = null;
        if (referenceNumber) {
          matchingEntry = await prisma.journalEntry.findUnique({
            where: { entryNumber: referenceNumber },
            select: { id: true, totalDebit: true, entryNumber: true },
          });
        }

        if (!matchingEntry) {
          // No local match — log as IMPORTED
          await prisma.tallySyncLog.create({
            data: {
              companyId,
              journalEntryId: null,
              tallyVoucherType: voucherType,
              tallyVoucherNumber: referenceNumber,
              referenceNumber,
              tallyAmount: tallyAmount ? new Decimal(tallyAmount) : null,
              syncStatus: "IMPORTED",
              xmlPayload: rawXml,
              syncedAt: new Date(),
            },
          });
          imported++;
        } else {
          // Found a local match — check for amount variance
          const localAmount = matchingEntry.totalDebit;
          const tallyDecimal = tallyAmount ? new Decimal(tallyAmount) : null;

          if (tallyDecimal && !localAmount.eq(tallyDecimal)) {
            // Amount mismatch — mark as VARIANCE
            // Check if a sync log already exists for this entry
            const existingLog = await prisma.tallySyncLog.findUnique({
              where: { journalEntryId: matchingEntry.id },
            });

            if (existingLog) {
              await prisma.tallySyncLog.update({
                where: { id: existingLog.id },
                data: {
                  syncStatus: "VARIANCE",
                  tallyVoucherNumber: referenceNumber,
                  referenceNumber,
                  tallyAmount: tallyDecimal,
                  xmlPayload: rawXml,
                  errorMessage: `Amount mismatch: local ${localAmount.toFixed(2)} vs Tally ${tallyDecimal.toFixed(2)}`,
                  syncedAt: new Date(),
                },
              });
            } else {
              await prisma.tallySyncLog.create({
                data: {
                  companyId,
                  journalEntryId: matchingEntry.id,
                  tallyVoucherType: voucherType,
                  tallyVoucherNumber: referenceNumber,
                  referenceNumber,
                  tallyAmount: tallyDecimal,
                  syncStatus: "VARIANCE",
                  xmlPayload: rawXml,
                  errorMessage: `Amount mismatch: local ${localAmount.toFixed(2)} vs Tally ${tallyDecimal.toFixed(2)}`,
                  syncedAt: new Date(),
                },
              });
            }
            variances++;
          }
          // If amounts match, no action needed — already in sync
        }
      } catch (err: unknown) {
        console.error("[Tally Reverse Sync] Error processing voucher:", err);
        errors++;
      }
    }
  } catch (err: unknown) {
    console.error("[Tally Reverse Sync] Failed to fetch from Tally:", err);
    errors++;
  }

  return { imported, variances, errors };
}
