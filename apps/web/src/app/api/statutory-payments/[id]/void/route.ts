import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidStatutoryPayment, ServiceError } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * POST /api/statutory-payments/[id]/void — undo a mis-keyed remittance.
 * Reverses the GL entry and marks the row VOID; the payable re-opens so it
 * can be remitted correctly. Posted balances only count POSTED JEs, so the
 * void restores the outstanding amount automatically.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    await voidStatutoryPayment({
      paymentId: id,
      companyId: company.id,
      userId: user.id,
      reason: body?.reason ?? undefined,
    });
    revalidatePath("/finance");
    return json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status ?? 400 });
    throw err;
  }
});
