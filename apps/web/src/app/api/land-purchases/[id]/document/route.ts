import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { uploadLandPurchaseDocument } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/document — upload a document (ATS, BBA, or Registry) for a land purchase.
 * Body: { documentType: "ATS" | "BBA" | "REGISTRY", documentUrl, documentName?, registryNo?, bbaDate? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const documentType = body?.documentType as string;
  const documentUrl = body?.documentUrl as string;
  const documentName = body?.documentName as string | undefined;
  const registryNo = body?.registryNo as string | undefined;
  const bbaDate = body?.bbaDate as string | undefined;

  if (!documentType || !["ATS", "BBA", "REGISTRY"].includes(documentType)) {
    return json({ error: "documentType must be ATS, BBA, or REGISTRY" }, { status: 400 });
  }
  if (!documentUrl) {
    return json({ error: "documentUrl is required" }, { status: 400 });
  }

  try {
    await uploadLandPurchaseDocument({
      landPurchaseId: id,
      userId: user.id,
      documentType: documentType as "ATS" | "BBA" | "REGISTRY",
      documentUrl,
      documentName,
      registryNo,
      bbaDate,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    return json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Upload failed") }, { status: 400 });
  }
});
