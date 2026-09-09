import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { payBrokerCommission } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/[id]/pay-commission — settle the broker commission payable.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.assetSale.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    const sale = await payBrokerCommission(id, user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/${id}`);
    revalidatePath(`/m/sales/${id}`);
    return json({ ok: true, commissionPaid: sale.commissionPaid });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to pay commission") }, { status: 400 });
  }
});
