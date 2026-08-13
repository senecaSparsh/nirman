import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  approveRequisition,
  convertRequisitionToPo,
  rejectRequisition,
  submitRequisition,
  waiveQuoteRequirement,
  logAction,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, ForbiddenError, getCompany, json, requirePermission, toNum, UnauthorizedError } from "@/lib/server";
import { z } from "zod";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const req = await prisma.materialRequisition.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
          preferredSupplier: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });
  if (!req) return json({ error: "Requisition not found" }, { status: 404 });

  const lines = req.lines.map((l) => ({
    id: l.id,
    materialId: l.materialId,
    materialCode: l.material.code,
    materialName: l.material.name,
    unit: l.material.unit,
    qtyRequested: toNum(l.qtyRequested),
    notes: l.notes,
    currentStock: l.currentStock != null ? toNum(l.currentStock) : null,
    lastRate: l.lastRate != null ? toNum(l.lastRate) : null,
    lastRateDate: l.lastRateDate?.toISOString() ?? null,
    preferredSupplier: l.preferredSupplier
      ? { id: l.preferredSupplier.id, name: l.preferredSupplier.name, phone: l.preferredSupplier.phone }
      : null,
  }));

  const totalQty = lines.reduce((s, l) => s + l.qtyRequested, 0);

  // Quote summary for the comparative quote engine
  const quotes = await prisma.vendorQuote.findMany({
    where: { requisitionId: req.id },
    include: { supplier: { select: { name: true } } },
  });
  const nonRejectedQuotes = quotes.filter((q) => q.status !== "REJECTED");
  const cheapestQuote = nonRejectedQuotes.find((q) => q.isCheapest) ?? null;
  const selectedQuote = quotes.find((q) => q.status === "SELECTED") ?? null;

  return json({
    id: req.id,
    reqNumber: req.reqNumber,
    projectId: req.projectId,
    projectName: req.project?.name ?? null,
    phaseId: req.phaseId,
    phaseName: req.phase?.name ?? null,
    status: req.status,
    requestDate: req.requestDate.toISOString(),
    neededByDate: req.neededByDate?.toISOString() ?? null,
    notes: req.notes,
    convertedPoId: req.convertedPoId,
    lineCount: lines.length,
    totalQty,
    createdAt: req.createdAt.toISOString(),
    lines,
    // Comparative Quote Engine summary
    quotes: {
      count: nonRejectedQuotes.length,
      minRequired: req.minQuotesRequired,
      waived: req.quotesWaived,
      waivedReason: req.quotesWaivedReason,
      gateSatisfied: req.quotesWaived || nonRejectedQuotes.length >= req.minQuotesRequired,
      cheapest: cheapestQuote
        ? { id: cheapestQuote.id, supplierName: cheapestQuote.supplier.name, landedTotal: toNum(cheapestQuote.landedTotal) }
        : null,
      selected: selectedQuote
        ? { id: selectedQuote.id, supplierName: selectedQuote.supplier.name, landedTotal: toNum(selectedQuote.landedTotal) }
        : null,
    },
  });
});

const convertSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  procurementScope: z.enum(["COMPANY", "PROJECT"]),
  destinationLocationId: z.string().min(1, "Destination location is required"),
  lineCosts: z.record(z.string(), z.coerce.number().nonnegative()),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "submit") {
      const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
      await submitRequisition(id, user.id);
      return json({ ok: true });
    }
    if (action === "approve") {
      const user = await requirePermission(PERM.REQUISITION_APPROVE);
      await approveRequisition(id, user.id);
      return json({ ok: true });
    }
    if (action === "reject") {
      const user = await requirePermission(PERM.REQUISITION_APPROVE);
      await rejectRequisition(id, user.id, body?.rejectReason);
      return json({ ok: true });
    }
    if (action === "waiveQuotes") {
      const user = await requirePermission(PERM.PO_APPROVE);
      const reason = body?.reason as string;
      if (!reason?.trim()) return json({ error: "A waiver reason is required" }, { status: 400 });
      await waiveQuoteRequirement({ requisitionId: id, waivedById: user.id, reason });
      return json({ ok: true });
    }
    if (action === "convert") {
      const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
      const parsed = convertSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const po = await convertRequisitionToPo({
        requisitionId: id,
        supplierId: parsed.data.supplierId,
        procurementScope: parsed.data.procurementScope,
        destinationLocationId: parsed.data.destinationLocationId,
        lineCosts: parsed.data.lineCosts,
        expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : undefined,
        notes: parsed.data.notes ?? undefined,
        userId: user.id,
      });
      return json({ ok: true, poId: po.id, poNumber: po.poNumber }, { status: 201 });
    }
    return json({ error: "Invalid action. Use submit, approve, reject, waiveQuotes, or convert." }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof ForbiddenError) return json({ error: err.message }, { status: 403 });
    if (err instanceof UnauthorizedError) return json({ error: err.message }, { status: 401 });
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const req = await prisma.materialRequisition.findFirst({
    where: { id, project: { companyId: company.id } },
  });
  if (!req) return json({ error: "Requisition not found" }, { status: 404 });
  // Only allow deleting draft or rejected requisitions
  if (!["DRAFT", "REJECTED"].includes(req.status)) {
    return json({ error: "Only draft or rejected requisitions can be deleted" }, { status: 400 });
  }
  // Delete lines first, then the requisition — with audit log
  await prisma.$transaction(async (tx) => {
    await tx.materialRequisitionLine.deleteMany({ where: { requisitionId: id } });
    await tx.materialRequisition.delete({ where: { id } });
    await logAction(tx, {
      userId: user.id,
      action: "REQUISITION_DELETE",
      entityType: "MaterialRequisition",
      entityId: id,
      before: { reqNumber: req.reqNumber, status: req.status },
    });
  });
  return json({ ok: true });
});
