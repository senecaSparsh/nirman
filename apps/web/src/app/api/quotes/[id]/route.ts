import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateVendorQuote, deleteVendorQuote } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { z } from "zod";

/**
 * GET /api/quotes/[id]
 * Returns a single vendor quote with its lines.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.QUOTATION_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const quote = await prisma.vendorQuote.findFirst({
    where: {
      id,
      OR: [
        { requisition: { project: { companyId: company.id } } },
        { quotationRequest: { companyId: company.id } },
      ],
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
      submittedBy: { select: { id: true, name: true } },
      selectedBy: { select: { id: true, name: true } },
    },
  });
  if (!quote) return json({ error: "Quote not found" }, { status: 404 });

  return json({
    id: quote.id,
    requisitionId: quote.requisitionId,
    supplierId: quote.supplierId,
    supplierName: quote.supplier.name,
    supplierPhone: quote.supplier.phone,
    fileUrl: quote.fileUrl,
    fileName: quote.fileName,
    mimeType: quote.mimeType,
    landedTotal: toNum(quote.landedTotal),
    validUntil: quote.validUntil?.toISOString() ?? null,
    isCheapest: quote.isCheapest,
    status: quote.status,
    selectedAt: quote.selectedAt?.toISOString() ?? null,
    selectionReason: quote.selectionReason,
    submittedBy: quote.submittedBy ? { id: quote.submittedBy.id, name: quote.submittedBy.name } : null,
    selectedBy: quote.selectedBy ? { id: quote.selectedBy.id, name: quote.selectedBy.name } : null,
    notes: quote.notes,
    createdAt: quote.createdAt.toISOString(),
    lines: quote.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitPrice: toNum(l.unitPrice),
      lineTotal: toNum(l.lineTotal),
    })),
  });
});

const updateQuoteLineSchema = z.object({
  materialId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  discountPerUnit: z.coerce.number().nonnegative().optional(),
  packingPerUnit: z.coerce.number().nonnegative().optional(),
  freightPerUnit: z.coerce.number().nonnegative().optional(),
  loadingPerUnit: z.coerce.number().nonnegative().optional(),
  insurancePerUnit: z.coerce.number().nonnegative().optional(),
  handlingPerUnit: z.coerce.number().nonnegative().optional(),
  buyerTransportPerUnit: z.coerce.number().nonnegative().optional(),
});

const updateQuoteSchema = z.object({
  landedTotal: z.coerce.number().nonnegative().optional(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  deliveryTermsType: z.enum(["DELIVERED_SITE", "EX_WORKS", "FOR_STATION", "CUSTOM"]).optional(),
  deliveryTerms: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).nullable().optional(),
  warranty: z.string().optional().nullable(),
  lines: z.array(updateQuoteLineSchema).optional(),
});

/**
 * PATCH /api/quotes/[id]
 * Update a quote (only if not yet selected as the winner).
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.QUOTATION_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = updateQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the quote belongs to the current company
  const company = await getCompany();
  const existing = await prisma.vendorQuote.findFirst({
    where: {
      id,
      OR: [
        { requisition: { project: { companyId: company.id } } },
        { quotationRequest: { companyId: company.id } },
      ],
    },
    select: { id: true },
  });
  if (!existing) return json({ error: "Quote not found" }, { status: 404 });

  const updated = await updateVendorQuote({
    quoteId: id,
    landedTotal: parsed.data.landedTotal,
    validUntil: parsed.data.validUntil !== undefined ? (parsed.data.validUntil ? new Date(parsed.data.validUntil) : null) : undefined,
    notes: parsed.data.notes,
    deliveryTermsType: parsed.data.deliveryTermsType,
    deliveryTerms: parsed.data.deliveryTerms,
    paymentTerms: parsed.data.paymentTerms,
    leadTimeDays: parsed.data.leadTimeDays,
    warranty: parsed.data.warranty,
    lines: parsed.data.lines?.map((l) => ({
      materialId: l.materialId,
      qty: l.qty,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
      discountPerUnit: l.discountPerUnit,
      packingPerUnit: l.packingPerUnit,
      freightPerUnit: l.freightPerUnit,
      loadingPerUnit: l.loadingPerUnit,
      insurancePerUnit: l.insurancePerUnit,
      handlingPerUnit: l.handlingPerUnit,
      buyerTransportPerUnit: l.buyerTransportPerUnit,
    })),
    userId: user.id,
  });

  return json({ ok: true, id: updated.id });
});

/**
 * DELETE /api/quotes/[id]
 * Delete a quote (only if not the selected winner).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.QUOTATION_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.vendorQuote.findFirst({
    where: {
      id,
      OR: [
        { requisition: { project: { companyId: company.id } } },
        { quotationRequest: { companyId: company.id } },
      ],
    },
    select: { id: true },
  });
  if (!existing) return json({ error: "Quote not found" }, { status: 404 });

  await deleteVendorQuote(id, user.id);
  return json({ ok: true });
});
