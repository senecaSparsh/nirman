import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  createVendorQuote,
  getComparativeStatement,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { z } from "zod";

/**
 * GET /api/quotes?requisitionId=<id>
 * Returns the full comparative statement for a requisition.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const requisitionId = req.nextUrl.searchParams.get("requisitionId");
  if (!requisitionId) return json({ error: "requisitionId is required" }, { status: 400 });

  const company = await getCompany();
  // Verify the requisition belongs to the current company
  const requisition = await prisma.materialRequisition.findFirst({
    where: { id: requisitionId, project: { companyId: company.id } },
    select: { id: true },
  });
  if (!requisition) return json({ error: "Requisition not found" }, { status: 404 });

  const statement = await getComparativeStatement(requisitionId);

  return json({
    requisition: statement.requisition,
    quotes: statement.quotes.map((q) => ({
      id: q.id,
      supplierId: q.supplierId,
      supplierName: q.supplier.name,
      supplierPhone: q.supplier.phone,
      fileUrl: q.fileUrl,
      fileName: q.fileName,
      mimeType: q.mimeType,
      landedTotal: toNum(q.landedTotal),
      validUntil: q.validUntil?.toISOString() ?? null,
      isCheapest: q.isCheapest,
      status: q.status,
      selectedAt: q.selectedAt?.toISOString() ?? null,
      selectionReason: q.selectionReason,
      submittedBy: q.submittedBy ? { id: q.submittedBy.id, name: q.submittedBy.name } : null,
      selectedBy: q.selectedBy ? { id: q.selectedBy.id, name: q.selectedBy.name } : null,
      notes: q.notes,
      varianceVsCheapest: q.varianceVsCheapest,
      createdAt: q.createdAt.toISOString(),
      lines: q.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        unit: l.material.unit,
        qty: toNum(l.qty),
        unitPrice: toNum(l.unitPrice),
        lineTotal: toNum(l.lineTotal),
      })),
    })),
    cheapestQuoteId: statement.cheapestQuoteId,
    selectedQuoteId: statement.selectedQuoteId,
    nonRejectedCount: statement.nonRejectedCount,
    gateSatisfied: statement.gateSatisfied,
  });
});

const quoteLineSchema = z.object({
  materialId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

const createQuoteSchema = z.object({
  requisitionId: z.string().min(1, "Requisition is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  fileUrl: z.string().min(1, "Quote file is required"),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  landedTotal: z.coerce.number().nonnegative(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(quoteLineSchema).min(1, "At least one line is required"),
});

/**
 * POST /api/quotes
 * Upload a vendor quote (metadata + lines + fileUrl from a prior /api/uploads call).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = createQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the requisition belongs to the current company
  const company = await getCompany();
  const reqExists = await prisma.materialRequisition.findFirst({
    where: { id: parsed.data.requisitionId, project: { companyId: company.id } },
    select: { id: true },
  });
  if (!reqExists) return json({ error: "Requisition not found" }, { status: 404 });

  const quote = await createVendorQuote({
    requisitionId: parsed.data.requisitionId,
    supplierId: parsed.data.supplierId,
    fileUrl: parsed.data.fileUrl,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    landedTotal: parsed.data.landedTotal,
    validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : undefined,
    notes: parsed.data.notes ?? undefined,
    submittedById: user.id,
    lines: parsed.data.lines.map((l) => ({
      materialId: l.materialId,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
  });

  return json({ ok: true, id: quote.id }, { status: 201 });
});
