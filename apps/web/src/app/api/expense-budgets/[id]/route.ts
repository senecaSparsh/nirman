import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // deleteMany swallows misses — a foreign or nonexistent id used to return
  // { ok: true } as if the delete had happened. Report 404 instead.
  const res = await prisma.expenseBudget.deleteMany({ where: { id, companyId: company.id, ...await scopeWhere("ExpenseBudget", {}) } });
  if (res.count === 0) return json({ error: "Expense budget not found" }, { status: 404 });
  revalidatePath("/expense-budgets");
  return json({ ok: true });
});
