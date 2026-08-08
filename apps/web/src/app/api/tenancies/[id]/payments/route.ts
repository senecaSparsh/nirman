import { NextRequest } from "next/server";
import { recordRentPayment } from "@nirman/services";
import { apiHandler, getCompany, json, rentPaymentSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = rentPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const payment = await recordRentPayment({
      tenancyId: id,
      companyId: company.id,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      dueDate: parsed.data.dueDate,
      mode: parsed.data.mode,
      reference: parsed.data.reference ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: payment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to record rent payment") }, { status: 400 });
  }
});
