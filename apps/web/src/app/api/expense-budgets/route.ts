import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { setExpenseBudget, getExpenseBudgetVariance, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const budgetSchema = z.object({
  projectId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  periodStart: z.string().min(1, "Period start is required"),
  periodEnd: z.string().min(1, "Period end is required"),
  notes: z.string().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const [budgets, variance] = await Promise.all([
    prisma.expenseBudget.findMany({
      where: { companyId: company.id, ...await scopeWhere("ExpenseBudget", {}) },
      orderBy: { periodStart: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        categoryMaster: { select: { id: true, name: true } },
      },
    }),
    getExpenseBudgetVariance(company.id),
  ]);
  const varianceMap = new Map(variance.map((v) => [v.budgetId, v]));
  return json(budgets.map((b) => {
    const v = varianceMap.get(b.id);
    return {
      id: b.id,
      category: b.category,
      categoryName: b.categoryMaster?.name ?? null,
      amount: toNum(b.amount),
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      projectId: b.projectId,
      projectName: b.project?.name ?? null,
      notes: b.notes,
      actualAmount: v?.actualAmount ?? 0,
      variance: v?.variance ?? toNum(b.amount),
      utilizationPct: v?.utilizationPct ?? 0,
    };
  }));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = budgetSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    await assertScopeAllows({
      projectId: d.projectId ?? null,
      departmentId: null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Scope violation" },
      { status: 403 },
    );
  }
  try {
    const budget = await setExpenseBudget({
      companyId: company.id,
      projectId: d.projectId ?? null,
      categoryId: d.categoryId ?? null,
      category: d.category,
      amount: d.amount,
      periodStart: new Date(d.periodStart),
      periodEnd: new Date(d.periodEnd),
      notes: d.notes ?? null,
      userId: user.id,
    });
    revalidatePath("/expense-budgets");
    return json({ ok: true, id: budget.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
