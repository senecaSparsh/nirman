import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  apiHandler,
  getCompany,
  getCompanyGroupIds,
  json,
  toNum,
  requirePermission,
  requireUser,
} from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * Generic cursor-based pagination endpoint for mobile list pages.
 *
 * GET /api/mobile/list/[type]?cursor=<iso-date>|<id>
 *
 * Returns: { items: T[], nextCursor: string | null }
 *
 * The cursor is `createdAt|id` of the last item in the current batch.
 * We query for items created strictly before the cursor's createdAt,
 * or with the same createdAt but a lower id (to break ties).
 *
 * Supported types: procurement, dprs, transfers, sales, requisitions
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ type: string }> }) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const { type } = await params;
  const cursor = searchParams.get("cursor");

  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  const BATCH_SIZE = 40;

  // Parse cursor: "createdAt|id"
  let cursorCreatedAt: Date | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const sep = cursor.lastIndexOf("|");
    if (sep > 0) {
      cursorCreatedAt = new Date(cursor.slice(0, sep));
      cursorId = cursor.slice(sep + 1);
    }
  }

  // Build the "before cursor" filter: (createdAt < cursorCreatedAt) OR (createdAt == cursorCreatedAt AND id < cursorId)
  const cursorFilter =
    cursorCreatedAt && cursorId
      ? {
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            { createdAt: cursorCreatedAt, id: { lt: cursorId } },
          ],
        }
      : {};

  switch (type) {
    case "procurement": {
      await requirePermission(PERM.PROCUREMENT_VIEW);
      const pos = await prisma.purchaseOrder.findMany({
        where: {
          companyId: { in: groupCompanyIds },
          ...cursorFilter,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: BATCH_SIZE + 1, // +1 to check if there are more
        include: {
          supplier: { select: { name: true } },
          lines: { select: { qtyOrdered: true, qtyReceived: true } },
        },
      });
      const hasMore = pos.length > BATCH_SIZE;
      const batch = hasMore ? pos.slice(0, BATCH_SIZE) : pos;
      const items = batch.map((p) => {
        const qtyOrdered = p.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
        const qtyReceived = p.lines.reduce(
          (s, l) => s + (l.qtyReceived ? toNum(l.qtyReceived) : 0),
          0,
        );
        const isOverdue =
          (p.status === "ORDERED" || p.status === "PARTIAL") &&
          p.expectedDate != null &&
          new Date(p.expectedDate) < new Date();
        return {
          id: p.id,
          poNumber: p.poNumber,
          status: p.status,
          supplierName: p.supplier.name,
          expectedDate: p.expectedDate?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          total: toNum(p.total),
          qtyOrdered,
          qtyReceived,
          isOverdue,
        };
      });
      const last = batch[batch.length - 1];
      const nextCursor = hasMore && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null;
      return json({ items, nextCursor });
    }

    case "dprs": {
      await requirePermission(PERM.DPR_VIEW);
      // DPRs are ordered by date (not createdAt), so we need a date-based cursor
      let dprCursorDate: Date | null = null;
      let dprCursorId: string | null = null;
      if (cursor) {
        const sep = cursor.lastIndexOf("|");
        if (sep > 0) {
          dprCursorDate = new Date(cursor.slice(0, sep));
          dprCursorId = cursor.slice(sep + 1);
        }
      }
      const dprCursorFilter =
        dprCursorDate && dprCursorId
          ? {
              OR: [
                { date: { lt: dprCursorDate } },
                { date: dprCursorDate, id: { lt: dprCursorId } },
              ],
            }
          : {};
      const dprs = await prisma.dailyProgressReport.findMany({
        where: {
          project: { companyId: { in: groupCompanyIds } },
          ...dprCursorFilter,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: BATCH_SIZE + 1,
        include: {
          project: { select: { id: true, name: true } },
          submittedBy: { select: { name: true } },
        },
      });
      const hasMore = dprs.length > BATCH_SIZE;
      const batch = hasMore ? dprs.slice(0, BATCH_SIZE) : dprs;
      const items = batch.map((d) => ({
        id: d.id,
        date: d.date.toISOString(),
        projectName: d.project.name,
        projectId: d.project.id,
        submittedByName: d.submittedBy?.name ?? null,
        approvalStatus: d.approvalStatus,
        progressPct: toNum(d.progressPct),
        workType: d.workType ?? null,
      }));
      const last = batch[batch.length - 1];
      const nextCursor = hasMore && last
        ? `${last.date.toISOString()}|${last.id}`
        : null;
      return json({ items, nextCursor });
    }

    case "transfers": {
      await requirePermission(PERM.INVENTORY_VIEW);
      const transfers = await prisma.stockTransfer.findMany({
        where: {
          OR: [
            { fromLocation: { companyId: { in: groupCompanyIds }, deletedAt: null } },
            { toLocation: { companyId: { in: groupCompanyIds }, deletedAt: null } },
          ],
          ...cursorFilter,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: BATCH_SIZE + 1,
        include: {
          fromLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
          toLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
          lines: { include: { material: { select: { name: true, unit: true } } } },
        },
      });
      const hasMore = transfers.length > BATCH_SIZE;
      const batch = hasMore ? transfers.slice(0, BATCH_SIZE) : transfers;
      const items = batch.map((t) => ({
        id: t.id,
        fromLocationName: t.fromLocation.name,
        fromLocationType: t.fromLocation.type,
        fromCompanyName: t.fromLocation.company?.name ?? null,
        fromCompanyId: t.fromLocation.companyId,
        toLocationName: t.toLocation.name,
        toLocationType: t.toLocation.type,
        toCompanyName: t.toLocation.company?.name ?? null,
        toCompanyId: t.toLocation.companyId,
        status: t.status,
        transferDate: t.transferDate.toISOString(),
        createdAt: t.createdAt.toISOString(),
        notes: t.notes,
        lineCount: t.lines.length,
        totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
        materials: t.lines.map((l) => l.material.name),
        materialsList: t.lines.map((l) => l.material.name).join("; "),
        isInterCompany: t.isInterCompany,
        transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
      }));
      const last = batch[batch.length - 1];
      const nextCursor = hasMore && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null;
      return json({ items, nextCursor });
    }

    case "sales": {
      await requirePermission(PERM.SALES_VIEW);
      const sales = await prisma.materialSale.findMany({
        where: { companyId: { in: groupCompanyIds }, ...cursorFilter },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: BATCH_SIZE + 1,
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          createdAt: true,
          subtotal: true,
          totalAmount: true,
          totalCost: true,
          grossProfit: true,
          scrapSubtotal: true,
          status: true,
          paymentStatus: true,
          customer: { select: { name: true } },
          project: { select: { name: true } },
          lines: { select: { id: true } },
        },
      });
      const hasMore = sales.length > BATCH_SIZE;
      const batch = hasMore ? sales.slice(0, BATCH_SIZE) : sales;
      const items = batch.map((s) => ({
        id: s.id,
        saleNumber: s.saleNumber,
        status: s.status,
        paymentStatus: s.paymentStatus,
        saleDate: s.saleDate.toISOString(),
        totalAmount: toNum(s.totalAmount),
        grossProfit: toNum(s.grossProfit),
        scrapSubtotal: toNum(s.scrapSubtotal),
        customerName: s.customer?.name ?? null,
        projectName: s.project?.name ?? null,
        lineCount: s.lines.length,
      }));
      const last = batch[batch.length - 1];
      const nextCursor = hasMore && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null;
      return json({ items, nextCursor });
    }

    case "requisitions": {
      await requirePermission(PERM.PROCUREMENT_VIEW);
      const reqs = await prisma.materialRequisition.findMany({
        where: { project: { companyId: { in: groupCompanyIds } }, ...cursorFilter },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: BATCH_SIZE + 1,
        include: {
          project: { select: { name: true } },
          lines: { select: { qtyRequested: true } },
          vendorQuotes: { select: { id: true } },
          requestedBy: { select: { name: true } },
        },
      });
      const hasMore = reqs.length > BATCH_SIZE;
      const batch = hasMore ? reqs.slice(0, BATCH_SIZE) : reqs;
      const items = batch.map((r) => ({
        id: r.id,
        reqNumber: r.reqNumber,
        status: r.status,
        projectName: r.project?.name ?? null,
        createdAt: r.createdAt.toISOString(),
        neededByDate: r.neededByDate?.toISOString() ?? null,
        lineCount: r.lines.length,
        quoteCount: r.vendorQuotes.length,
        minQuotesRequired: r.minQuotesRequired,
        quotesWaived: r.quotesWaived,
        convertedToPo: !!r.convertedPoId,
        rejectReason: r.rejectReason ?? null,
        requestedByName: r.requestedBy?.name ?? null,
      }));
      const last = batch[batch.length - 1];
      const nextCursor = hasMore && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null;
      return json({ items, nextCursor });
    }

    default:
      return json({ error: "Unknown list type" }, { status: 404 });
  }
});
