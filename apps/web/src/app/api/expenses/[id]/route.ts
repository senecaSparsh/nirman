import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, toNum, requirePermission } from "@/lib/server";
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
  const user = await requirePermission(PERM.FINANCE_VIEW);
  const { id } = await params;
  const expense = await prisma.expense.findFirst({
    where: { id, companyId: user.companyId ?? undefined },
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
  await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
  if (parsed.data.category !== undefined) data.category = parsed.data.category;
  if (parsed.data.amount !== undefined) data.amount = parsed.data.amount;
  if (parsed.data.date !== undefined) data.date = parsed.data.date ? new Date(parsed.data.date) : null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  const updated = await prisma.expense.update({ where: { id }, data });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  await prisma.expense.delete({ where: { id } });
  return json({ ok: true });
});
