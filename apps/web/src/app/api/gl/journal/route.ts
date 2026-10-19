import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { postJournalEntry, withSerializableTransaction, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requireEffectivePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/gl/journal — post a manual journal voucher (accrual, write-off,
 * reclass, any adjustment that has no source document). Balanced entries only
 * — postJournalEntry rejects Σdr ≠ Σcr. FINANCE_MANAGE.
 *
 * Body: { memo, entryDate?, lines: [{ accountCode, debit, credit, memo?, entityType?, entityId? }] }
 * Each line carries either a debit or a credit (not both). A line may also
 * carry a project allocation — entityType: "Project" + a valid projectId —
 * so JVs like cost reallocations land in the right project's WIP slice.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  const memo = typeof body?.memo === "string" ? body.memo.trim() : "";
  if (!memo) return json({ error: "A memo describing the adjustment is required" }, { status: 400 });

  const rawLines: unknown[] = Array.isArray(body?.lines) ? body.lines : [];
  if (rawLines.length < 2) return json({ error: "A journal voucher needs at least two lines (one debit, one credit)" }, { status: 400 });

  const lines = await Promise.all((rawLines as { accountCode?: string; debit?: unknown; credit?: unknown; memo?: unknown; entityType?: unknown; entityId?: unknown }[]).map(async (l, i) => {
    const debit = Number(l?.debit) || 0;
    const credit = Number(l?.credit) || 0;
    if (!l?.accountCode || typeof l.accountCode !== "string") {
      throw new ServiceError(`Line ${i + 1}: pick an account`, 400);
    }
    if (debit < 0 || credit < 0) throw new ServiceError(`Line ${i + 1}: amounts cannot be negative`, 400);
    if (debit > 0 && credit > 0) throw new ServiceError(`Line ${i + 1}: a line is either a debit or a credit, not both`, 400);
    if (debit === 0 && credit === 0) throw new ServiceError(`Line ${i + 1}: enter a debit or credit amount`, 400);
    // Optional project allocation — the only entity link a manual JV may
    // claim (keeps project-level cost reallocations inside the right WIP slice).
    if (l?.entityType != null || l?.entityId != null) {
      if (l.entityType !== "Project" || typeof l.entityId !== "string") {
        throw new ServiceError(`Line ${i + 1}: manual entries may only be allocated to a project`, 400);
      }
      const project = await prisma.project.findFirst({ where: { id: l.entityId, companyId: company.id, deletedAt: null }, select: { id: true } });
      if (!project) throw new ServiceError(`Line ${i + 1}: project not found`, 404);
    }
    return {
      accountCode: l.accountCode,
      debit,
      credit,
      ...(typeof l.memo === "string" && l.memo.trim() ? { memo: l.memo.trim() } : {}),
      ...(l?.entityType === "Project" && typeof l?.entityId === "string" ? { entityType: "Project", entityId: l.entityId } : {}),
    };
  }));

  const entryDate = body?.entryDate ? new Date(body.entryDate) : undefined;
  if (entryDate && isNaN(entryDate.getTime())) return json({ error: "Invalid entry date" }, { status: 400 });

  const entry = await withSerializableTransaction(async (tx) =>
    postJournalEntry(tx, {
      companyId: company.id,
      sourceType: "MANUAL",
      memo,
      postedById: user.id,
      entryDate,
      lines,
    }),
  );

  if (!entry) return json({ error: "Entry has no movement — nothing to post" }, { status: 400 });
  revalidatePath("/gl");
  return json({ ok: true, entryNumber: entry.entryNumber, id: entry.id }, { status: 201 });
});
