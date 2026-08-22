import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addQuoteToRequest } from "@nirman/services";
import { PERM } from "@/lib/roles";
import {
  apiHandler,
  getCompany,
  json,
  requirePermission,
  addQuoteSchema,
} from "@/lib/server";

/**
 * POST /api/quotations/[id]/quotes — add a vendor quote to a quotation
 * request. Supports inline supplier creation (newSupplier field) so the
 * user never has to go to a separate "add supplier" page.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.QUOTATION_MANAGE);
  const company = await getCompany();
  const { id } = { id: new URL(req.url).pathname.split("/").slice(-2, -1)[0]! };

  // Verify the request belongs to the current company.
  const request = await prisma.quotationRequest.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, status: true },
  });
  if (!request) return json({ error: "Quotation request not found" }, { status: 404 });
  if (request.status === "APPROVED") {
    return json({ error: "Cannot add quotes to an approved request" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = addQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  // ── Inline supplier creation ──
  // If newSupplier is provided, create the supplier first (in the current
  // company), then use its ID. This lets the user add a seller directly
  // from the quote upload dialog — no separate "add supplier" page.
  let supplierId = data.supplierId ?? undefined;
  if (data.newSupplier) {
    // Check for an existing supplier with the same name (case-insensitive).
    const existing = await prisma.supplier.findFirst({
      where: {
        companyId: company.id,
        name: { equals: data.newSupplier.name, mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      supplierId = existing.id;
    } else {
      const created = await prisma.supplier.create({
        data: {
          companyId: company.id,
          name: data.newSupplier.name,
          gstin: data.newSupplier.gstin ?? null,
          phone: data.newSupplier.phone ?? null,
          email: data.newSupplier.email ?? null,
          address: data.newSupplier.address ?? null,
        },
      });
      supplierId = created.id;
    }
  }

  if (!supplierId) {
    return json({ error: "Either select an existing supplier or create a new one" }, { status: 400 });
  }

  const quote = await addQuoteToRequest({
    quotationRequestId: id,
    supplierId,
    fileUrl: data.fileUrl ?? undefined,
    fileName: data.fileName ?? undefined,
    mimeType: data.mimeType ?? undefined,
    quoteSource: data.quoteSource,
    sourceNote: data.sourceNote ?? undefined,
    validUntil: data.validUntil ? new Date(data.validUntil) : null,
    notes: data.notes ?? undefined,
    submittedById: user.id,
    paymentTerms: data.paymentTerms ?? undefined,
    deliveryTerms: data.deliveryTerms ?? undefined,
    deliveryTermsType: data.deliveryTermsType ?? undefined,
    leadTimeDays: data.leadTimeDays ?? undefined,
    warranty: data.warranty ?? undefined,
    lines: data.lines.map((l) => ({
      materialId: l.materialId,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPerUnit: l.discountPerUnit,
      packingPerUnit: l.packingPerUnit,
      freightPerUnit: l.freightPerUnit,
      loadingPerUnit: l.loadingPerUnit,
      insurancePerUnit: l.insurancePerUnit,
      handlingPerUnit: l.handlingPerUnit,
      buyerTransportPerUnit: l.buyerTransportPerUnit,
    })),
  });

  return json(
    {
      id: quote.id,
      supplierId: quote.supplierId,
      supplierName: quote.supplier.name,
      landedTotal: quote.landedTotal.toNumber(),
      status: quote.status,
    },
    { status: 201 },
  );
});
