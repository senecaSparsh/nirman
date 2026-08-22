import { NextRequest } from "next/server";
import { createLegalDoc, listLegalDocs, listAllLegalDocs } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/legal-documents?landPurchaseId=xxx or ?projectId=xxx
 * Returns legal documents for the specified land purchase or project.
 *
 * GET /api/legal-documents?all=true&type=...&status=...&appliesTo=...
 * Returns ALL legal documents for the company (for the /permissions
 * overview page), with optional filters. Includes project/land names.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "true";

  if (all) {
    const docs = await listAllLegalDocs(company.id, {
      type: sp.get("type") ?? undefined,
      status: sp.get("status") ?? undefined,
      appliesTo: sp.get("appliesTo") ?? undefined,
    });
    return json(
      docs.map((d) => ({
        id: d.id,
        landPurchaseId: d.landPurchaseId,
        projectId: d.projectId,
        type: d.type,
        title: d.title,
        authority: d.authority,
        status: d.status,
        appliesTo: d.appliesTo,
        docNumber: d.docNumber,
        sortOrder: d.sortOrder,
        prerequisiteType: d.prerequisiteType,
        obtained: d.obtained,
        applicationDate: d.applicationDate?.toISOString() ?? null,
        issueDate: d.issueDate?.toISOString() ?? null,
        validFrom: d.validFrom?.toISOString() ?? null,
        validTill: d.validTill?.toISOString() ?? null,
        amount: d.amount ? toNum(d.amount) : null,
        expectedRegistryDate: d.expectedRegistryDate?.toISOString() ?? null,
        documentUrl: d.documentUrl,
        documentName: d.documentName,
        notes: d.notes,
        createdAt: d.createdAt.toISOString(),
        projectName: d.project?.name ?? null,
        landSellerName: d.landPurchase?.sellerName ?? null,
        landLocation: d.landPurchase?.location ?? null,
      })),
    );
  }

  const landPurchaseId = sp.get("landPurchaseId");
  const projectId = sp.get("projectId");

  const docs = await listLegalDocs(company.id, { landPurchaseId: landPurchaseId ?? undefined, projectId: projectId ?? undefined });

  return json(
    docs.map((d) => ({
      id: d.id,
      landPurchaseId: d.landPurchaseId,
      projectId: d.projectId,
      type: d.type,
      title: d.title,
      authority: d.authority,
      status: d.status,
      appliesTo: d.appliesTo,
      docNumber: d.docNumber,
      sortOrder: d.sortOrder,
      prerequisiteType: d.prerequisiteType,
      obtained: d.obtained,
      applicationDate: d.applicationDate?.toISOString() ?? null,
      issueDate: d.issueDate?.toISOString() ?? null,
      validFrom: d.validFrom?.toISOString() ?? null,
      validTill: d.validTill?.toISOString() ?? null,
      amount: d.amount ? toNum(d.amount) : null,
      expectedRegistryDate: d.expectedRegistryDate?.toISOString() ?? null,
      documentUrl: d.documentUrl,
      documentName: d.documentName,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    })),
  );
});

/**
 * POST /api/legal-documents
 * Create a new legal document (permission, license, NOC, certificate, ATS).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.LEGAL_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  const {
    landPurchaseId, projectId, type, title, authority, status, appliesTo, docNumber,
    sortOrder, prerequisiteType, obtained,
    applicationDate, issueDate, validFrom, validTill, amount, expectedRegistryDate,
    documentUrl, documentName, notes,
  } = body;

  if (!type || !title) {
    return json({ error: "Type and title are required" }, { status: 400 });
  }

  try {
    const doc = await createLegalDoc({
      companyId: company.id,
      landPurchaseId: landPurchaseId || undefined,
      projectId: projectId || undefined,
      type,
      title,
      authority: authority || undefined,
      status: status || "NOT_REQUIRED",
      appliesTo: appliesTo || "BOTH",
      docNumber: docNumber || undefined,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      prerequisiteType: prerequisiteType || null,
      obtained: obtained ?? false,
      applicationDate: applicationDate ? new Date(applicationDate) : null,
      issueDate: issueDate ? new Date(issueDate) : null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTill: validTill ? new Date(validTill) : null,
      amount: amount ? Number(amount) : null,
      expectedRegistryDate: expectedRegistryDate ? new Date(expectedRegistryDate) : null,
      documentUrl: documentUrl || undefined,
      documentName: documentName || undefined,
      notes: notes || undefined,
      userId: user.id,
    });
    return json({ id: doc.id, ok: true }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed to create legal document" }, { status: 400 });
  }
});
