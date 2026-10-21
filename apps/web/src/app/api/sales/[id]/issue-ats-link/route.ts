import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { issueAtsAcceptLink, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requireEffectivePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/[id]/issue-ats-link — issue (or rotate) the shareable
 * buyer-acceptance link for this sale's ATS. Returns the public URL path to
 * share with the buyer (e.g. via WhatsApp). Requires SALES_MANAGE.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireEffectivePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const sale = await prisma.assetSale.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("AssetSale", {}) },
    select: { id: true },
  });
  if (!sale) return json({ error: "Sale not found" }, { status: 404 });

  try {
    const result = await issueAtsAcceptLink({ saleId: id, companyId: company.id, userId: user.id });
    revalidatePath(`/sales/${id}`);
    revalidatePath(`/m/sales/${id}`);
    return json({ ok: true, ...result, acceptPath: `/accept/ats/${result.token}` });
  } catch (err: unknown) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
