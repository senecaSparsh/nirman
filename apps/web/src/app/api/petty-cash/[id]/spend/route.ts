import { type NextRequest } from "next/server";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
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
