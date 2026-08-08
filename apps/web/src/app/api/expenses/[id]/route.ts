import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { reverseJournalEntry, postExpense, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const expenseUpdateSchema = z.object({
  projectId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required").optional(),
  amount: z.coerce.number().positive("Amount must be > 0").optional(),
  date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const expense = await prisma.expense.findFirst({
    where: { id, companyId: company.id },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!expense) return json({ error: "Expense not found" }, { status: 404 });
  return json({
    id: expense.id,
    projectId: expense.projectId,
    projectName: expense.project?.name ?? null,
    category: expense.category,
    amount: toNum(expense.amount),
    date: expense.date.toISOString(),
    notes: expense.notes,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id, companyId: company.id } });
    if (!existing) throw new Error("Expense not found in this company");

    const data: Record<string, unknown> = {};
    if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.amount !== undefined) data.amount = parsed.data.amount;
    if (parsed.data.date !== undefined) data.date = parsed.data.date ? new Date(parsed.data.date) : null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    const exp = await tx.expense.update({ where: { id }, data });

    // If the amount changed, reverse the old GL entry and post a new one
    if (parsed.data.amount !== undefined && parsed.data.amount !== toNum(existing.amount)) {
      const glEntry = await tx.journalEntry.findFirst({
        where: { sourceType: "EXPENSE", sourceId: id },
      });
      if (glEntry) {
        await reverseJournalEntry(tx, glEntry.id, {
          postedById: user.id,
          memo: "Reversal: expense amount updated",
        });
      }
      await postExpense(tx, {
        companyId: company.id,
        expenseId: id,
        amount: parsed.data.amount,
        postedById: user.id,
      });
    }

    await logAction(tx, {
      userId: user.id,
      action: "EXPENSE_UPDATE",
      entityType: "Expense",
      entityId: id,
      before: { amount: toNum(existing.amount), category: existing.category },
      after: { amount: toNum(exp.amount), category: exp.category },
    });
    return exp;
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    // Validate the expense belongs to the user's company
    const expense = await tx.expense.findFirst({ where: { id, companyId: company.id } });
    if (!expense) throw new Error("Expense not found in this company");
    // Reverse the GL entry before deleting the expense row
    const glEntry = await tx.journalEntry.findFirst({
      where: { sourceType: "EXPENSE", sourceId: id },
    });
    if (glEntry) {
      await reverseJournalEntry(tx, glEntry.id, {
        postedById: user.id,
        memo: "Reversal: expense deleted",
      });
    }
    await tx.expense.delete({ where: { id } });
  });
  return json({ ok: true });
});
