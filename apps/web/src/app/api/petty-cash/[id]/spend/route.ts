import { type NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, getUserPermissions, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { recordPettyCashSpend } from "@nirman/services";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.EXPENSE_CREATE);
  const company = await getCompany();
  const { id: floatId } = await params;
  const body = await req.json();
  const { amount, category, categoryId, notes } = body;
  if (!amount || !category) {
    return json({ error: "Amount and category are required" }, { status: 400 });
  }

  // Custodian scoping: only the float's custodian (or a finance manager
  // recording on their behalf) can spend from it. Unassigned floats stay
  // open to any expense-creator. The float must also sit inside the
  // caller's project/department scope — the spend lands on the float's
  // project, so without this a scoped user could post expenses outside it.
  const float = await prisma.pettyCashFloat.findFirst({
    where: { id: floatId, companyId: company.id, ...await scopeWhere("PettyCashFloat", {}) },
    select: { custodianId: true },
  });
  if (!float) return json({ error: "Petty cash float not found" }, { status: 404 });
  if (float.custodianId && float.custodianId !== user.id) {
    const __effPerms = await getUserPermissions();
    if (!__effPerms.includes(PERM.FINANCE_MANAGE)) {
      return json({ error: "Only this float's custodian or a finance manager can record spends" }, { status: 403 });
    }
  }
  try {
    const result = await recordPettyCashSpend(floatId, company.id, {
      amount,
      category,
      categoryId: categoryId ?? null,
      notes: notes ?? null,
    }, user.id);
    return json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record spend";
    const status = message.includes("not found") ? 404 : message.includes("Insufficient") ? 409 : 400;
    return json({ error: message }, { status });
  }
});
