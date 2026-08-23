import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { uploadLandPurchaseDocument } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/document — upload a document (ATS or Registry) for a land purchase.
 * Body: { documentType: "ATS" | "REGISTRY", documentUrl, documentName?, registryNo? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const documentType = body?.documentType as string;
  const documentUrl = body?.documentUrl as string;
  const documentName = body?.documentName as string | undefined;
  const registryNo = body?.registryNo as string | undefined;

  if (!documentType || !["ATS", "REGISTRY"].includes(documentType)) {
    return json({ error: "documentType must be ATS or REGISTRY" }, { status: 400 });
  }
  if (!documentUrl) {
    return json({ error: "documentUrl is required" }, { status: 400 });
  }

  try {
    await uploadLandPurchaseDocument({
      landPurchaseId: id,
      userId: user.id,
      documentType: documentType as "ATS" | "REGISTRY",
      documentUrl,
      documentName,
      registryNo,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    return json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Upload failed") }, { status: 400 });
  }
});
