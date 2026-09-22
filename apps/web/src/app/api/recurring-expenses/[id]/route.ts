import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  const res = await prisma.recurringExpense.updateMany({ where: { id, companyId: company.id, ...await scopeWhere("RecurringExpense", {}) }, data });
  if (res.count === 0) return json({ error: "Recurring expense not found" }, { status: 404 });
  revalidatePath("/recurring-expenses");
  return json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const res = await prisma.recurringExpense.deleteMany({ where: { id, companyId: company.id, ...await scopeWhere("RecurringExpense", {}) } });
  if (res.count === 0) return json({ error: "Recurring expense not found" }, { status: 404 });
  revalidatePath("/recurring-expenses");
  return json({ ok: true });
});
