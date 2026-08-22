import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { payBrokerCommission } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/[id]/pay-commission — settle the broker commission payable.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;
  try {
    const sale = await payBrokerCommission(id, user.id);
    revalidatePath("/sales");
    return json({ ok: true, commissionPaid: sale.commissionPaid });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to pay commission") }, { status: 400 });
  }
});
