import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getPrintableSaleData } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sales/[id]/print — full data for the printable sales form.
 * The printable payload includes customer PII, pricing, payments and the
 * company's own letterhead — it must stay inside the caller's tenant AND
 * inside the caller's project/department scope (same rule as the sale
 * detail route — a scoped salesperson can't read an out-of-scope sale).
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;
  // Scope pre-check: getPrintableSaleData only filters by companyId.
  const inScope = await prisma.assetSale.findFirst({
    where: await scopeWhere("AssetSale", { id, companyId: company.id }),
    select: { id: true },
  });
  if (!inScope) return json({ error: "Sale not found" }, { status: 404 });
  try {
    const data = await getPrintableSaleData(id, company.id);
    return json(data);
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Sale not found") }, { status: 404 });
  }
});
