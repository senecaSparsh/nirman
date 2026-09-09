import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { uploadSaleDocument } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/[id]/document — upload a document (ATS, BBA, Registry, Allotment) for a sale.
 * Body: { documentType: "ATS" | "BBA" | "REGISTRY" | "ALLOTMENT", documentUrl, documentName }
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.assetSale.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const documentType = body?.documentType as string;
  const documentUrl = body?.documentUrl as string;
  const documentName = body?.documentName as string | undefined;

  if (!documentType || !["ATS", "BBA", "REGISTRY", "ALLOTMENT"].includes(documentType)) {
    return json({ error: "documentType must be ATS, BBA, REGISTRY, or ALLOTMENT" }, { status: 400 });
  }
  if (!documentUrl) {
    return json({ error: "documentUrl is required" }, { status: 400 });
  }

  try {
    await uploadSaleDocument({
      saleId: id,
      userId: user.id,
      documentType: documentType as "ATS" | "BBA" | "REGISTRY" | "ALLOTMENT",
      documentUrl,
      documentName,
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${id}`);
    return json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Upload failed") }, { status: 400 });
  }
});
