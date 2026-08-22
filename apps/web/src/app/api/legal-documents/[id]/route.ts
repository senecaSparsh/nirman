import { NextRequest } from "next/server";
import { updateLegalDoc, deleteLegalDoc } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * PATCH /api/legal-documents/[id]
 * Update a legal document.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.LEGAL_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();

  const {
    type, title, authority, status, appliesTo, docNumber,
    sortOrder, prerequisiteType, obtained,
    applicationDate, issueDate, validFrom, validTill, amount, expectedRegistryDate,
    documentUrl, documentName, notes,
  } = body;

  try {
    const doc = await updateLegalDoc(id, company.id, {
      type: type || undefined,
      title: title || undefined,
      authority: authority ?? undefined,
      status: status || undefined,
      appliesTo: appliesTo || undefined,
      docNumber: docNumber ?? undefined,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
      prerequisiteType: prerequisiteType ?? undefined,
      obtained: obtained !== undefined ? Boolean(obtained) : undefined,
      applicationDate: applicationDate ? new Date(applicationDate) : applicationDate === null ? null : undefined,
      issueDate: issueDate ? new Date(issueDate) : issueDate === null ? null : undefined,
      validFrom: validFrom ? new Date(validFrom) : validFrom === null ? null : undefined,
      validTill: validTill ? new Date(validTill) : validTill === null ? null : undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      expectedRegistryDate: expectedRegistryDate ? new Date(expectedRegistryDate) : expectedRegistryDate === null ? null : undefined,
      documentUrl: documentUrl ?? undefined,
      documentName: documentName ?? undefined,
      notes: notes ?? undefined,
    }, user.id);
    return json({ id: doc.id, ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed to update legal document" }, { status: 400 });
  }
});

/**
 * DELETE /api/legal-documents/[id]
 * Soft-delete a legal document.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.LEGAL_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await deleteLegalDoc(id, company.id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed to delete legal document" }, { status: 400 });
  }
});
