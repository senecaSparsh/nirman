import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@nirman/db";
import { postJournalEntry, reverseJournalEntry, ensureGlAccount } from "../gl-posting";

/**
 * Double-reversal guard — a JE may only be reversed once, and a reversal JE
 * can never itself be reversed (that would un-post the original event).
 * Dedupes on the reversalOfId link, not the doc-level sourceId (one doc can
 * carry several JEs — e.g. revenue + COGS).
 */
describe("reverseJournalEntry double-reversal guard", () => {
  const ids: string[] = [];
  let companyId = "";

  afterAll(async () => {
    if (companyId) {
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: ids } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("refuses a second reversal and refuses reversing the reversal itself", async () => {
    const company = await prisma.company.findFirst({ where: { deletedAt: null }, select: { id: true } });
    if (!company) return; // no fixture company
    companyId = company.id;

    const created = await prisma.$transaction(async (tx) => {
      await ensureGlAccount(tx as never, companyId, "1200"); // Inventory — real COA code
      await ensureGlAccount(tx as never, companyId, "1400"); // Customer Deposits
      const je = await postJournalEntry(tx as never, {
        companyId,
        sourceType: "TEST_REVERSAL_GUARD",
        memo: "guard fixture",
        lines: [
          { accountCode: "1200", debit: 100, credit: 0 },
          { accountCode: "1400", debit: 0, credit: 100 },
        ],
      });
      if (!je) throw new Error("postJournalEntry returned null");
      const rev = await reverseJournalEntry(tx as never, je.id, {});
      if (!rev) throw new Error("reverseJournalEntry returned null");
      return { jeId: je.id, revId: rev.id };
    });
    ids.push(created.jeId, created.revId);

    // Second reversal of the same entry must refuse.
    await expect(
      prisma.$transaction((tx) => reverseJournalEntry(tx as never, created.jeId, {})),
    ).rejects.toThrow(/already reversed/);

    // Reversing the _REVERSAL entry itself must refuse.
    await expect(
      prisma.$transaction((tx) => reverseJournalEntry(tx as never, created.revId, {})),
    ).rejects.toThrow(/Cannot reverse a reversal/);
  });
});
