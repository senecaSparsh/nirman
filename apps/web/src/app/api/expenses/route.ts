import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { postExpense, reverseJournalEntry } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const expenseSchema = z.object({
  projectId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const expenses = await prisma.expense.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  return json(
    expenses.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      projectName: e.project?.name ?? null,
      category: e.category,
      amount: toNum(e.amount),
      date: e.date.toISOString(),
      notes: e.notes,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        companyId: company.id,
        projectId: parsed.data.projectId ?? null,
        category: parsed.data.category,
        amount: parsed.data.amount,
        date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
        notes: parsed.data.notes ?? null,
        createdById: user.id,
      },
    });
    // Post to the General Ledger: expense it (not capitalised), credit cash.
    await postExpense(tx, {
      companyId: company.id,
      expenseId: created.id,
      amount: parsed.data.amount,
      postedById: user.id,
    });
    return created;
  });
  return json({ ok: true, id: expense.id }, { status: 201 });
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return json({ error: "id query param is required" }, { status: 400 });
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
