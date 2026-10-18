import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { reverseJournalEntry, withSerializableTransaction, logAction, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requireEffectivePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/gl/entries/[id]/reverse — post a reversing journal entry for an
 * existing POSTED entry (the only way to correct an entry — books are
 * append-only). The reversal swaps every debit/credit and links back via
 * reversalOfId; reversing twice is rejected by the service.
 *
 * Side effects: for an OPENING supplier-payable entry (sourceId = supplier),
 * supplier.balanceOwed is decremented by the AP leg so the supplier ledger
 * moves with the GL — the same coupling the opening create enforces.
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const memo = typeof body?.memo === "string" && body.memo.trim() ? body.memo.trim() : undefined;

  const original = await prisma.journalEntry.findFirst({
    where: { id, companyId: company.id },
    select: {
      id: true,
      entryNumber: true,
      sourceType: true,
      sourceId: true,
      status: true,
      lines: { select: { credit: true, account: { select: { code: true } }, entityType: true, entityId: true } },
    },
  });
  if (!original) throw new ServiceError("Journal entry not found", 404);
  if (original.status !== "POSTED") throw new ServiceError(`Cannot reverse an entry in status ${original.status}`, 400);

  const result = await withSerializableTransaction(async (tx) => {
    const reversal = await reverseJournalEntry(tx, original.id, { postedById: user.id, memo });
    if (!reversal) throw new ServiceError("Entry has no lines to reverse", 400);

    // Opening supplier payable: the AP leg credited balanceOwed at create —
    // unwind it the same way the create set it.
    let supplierUnwound = 0;
    if (original.sourceType === "OPENING" && original.sourceId) {
      const apLeg = original.lines.find((l) => l.account.code === "2000" && l.entityType === "Supplier");
      if (apLeg && Number(apLeg.credit) > 0) {
        const updated = await tx.supplier.updateMany({
          where: { id: original.sourceId, companyId: company.id },
          data: { balanceOwed: { decrement: apLeg.credit } },
        });
        if (updated.count > 0) supplierUnwound = Number(apLeg.credit);
      }
    }

    await logAction(tx, {
      userId: user.id,
      companyId: company.id,
      action: "JOURNAL_ENTRY_REVERSE",
      entityType: "JournalEntry",
      entityId: original.id,
      before: { entryNumber: original.entryNumber, sourceType: original.sourceType },
      after: { reversalEntryNumber: reversal.entryNumber, supplierUnwound: supplierUnwound || undefined },
    });
    return { reversal, supplierUnwound };
  });

  revalidatePath("/gl");
  return json({ ok: true, entryNumber: result.reversal.entryNumber, supplierUnwound: result.supplierUnwound }, { status: 201 });
});
