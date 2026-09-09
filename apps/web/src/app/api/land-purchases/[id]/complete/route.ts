import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { completeLandPurchase } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/complete — complete a staged land purchase.
 * Requires the registry document to be uploaded (either pre-uploaded or provided here).
 * Body: { registryDocumentUrl?, registryDocumentName?, registryNo? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  try {
    const result = await completeLandPurchase({
      landPurchaseId: id,
      userId: user.id,
      registryDocumentUrl: body?.registryDocumentUrl,
      registryDocumentName: body?.registryDocumentName,
      registryNo: body?.registryNo,
      partialRegistryAllowed: body?.partialRegistryAllowed,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    return json({ ok: true, purchaseStage: result.purchaseStage });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Complete failed") }, { status: 400 });
  }
});
