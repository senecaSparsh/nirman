import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";

import {
  getCompany,
  getCompanyGroupIds,
  toNum,
  getUserRole,
  getCurrentUserMembership,
} from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { type DirectPurchaseListItem } from "./MobileProcurementList";
import { MobileProcurementHubTabs } from "./MobileProcurementHubTabs";

export default function MobileProcurementPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileProcurementContent />
    </Suspense>
  );
}

async function MobileProcurementContent() {
  await connection();
  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);
  const canApprove = hasPermission(role, PERM.PO_APPROVE);
  const canApproveRequisition = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canCreateQuotation = hasPermission(role, PERM.QUOTATION_MANAGE);
  const membership = await getCurrentUserMembership();

  // ── Fetch data for all hub tabs + form dropdown data in parallel ──
  const BATCH_SIZE = 60;
  const [pos, directPurchases, reqs, quotationRequests, quotationProjects, quotationMaterials, formSuppliers, _formProjects, _formMaterials, formLocations, formCategories, formPurchaseOrders] = await Promise.all([
    // ── POs tab ──
    prisma.purchaseOrder.findMany({
      where: { companyId: { in: groupCompanyIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH_SIZE + 1,
      include: {
        supplier: { select: { name: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
    prisma.directPurchase.findMany({
      where: { companyId: company.id },
      orderBy: { billDate: "desc" },
      take: 60,
      include: {
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        lines: { select: { qty: true } },
      },
    }),
    // ── Indents tab ──
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH_SIZE + 1,
      include: {
        project: { select: { name: true } },
        lines: { select: { qtyRequested: true } },
        vendorQuotes: { select: { id: true } },
        requestedBy: { select: { name: true } },
      },
    }),
    // ── Quotations tab ──
    prisma.quotationRequest.findMany({
      where: { companyId: { in: groupCompanyIds } },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        lines: { select: { id: true, qtyRequired: true, materialId: true } },
        quotes: {
          where: { status: { not: "REJECTED" } },
          select: {
            id: true,
            landedTotal: true,
            status: true,
            supplierId: true,
            isCheapest: true,
          },
        },
        convertedPo: { select: { id: true, poNumber: true, status: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
        hsnCode: true,
        gstRate: true,
      },
      orderBy: { name: "asc" },
    }),
    // ── Form dropdown data ──
    prisma.supplier.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    // projects already fetched above as quotationProjects — reuse
    Promise.resolve(null),
    // materials already fetched above as quotationMaterials — reuse
    Promise.resolve(null),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true, projectId: true },
      orderBy: { name: "asc" },
    }),
    prisma.materialCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["APPROVED", "ORDERED", "RECEIVED"] }, companyId: company.id },
      select: { id: true, poNumber: true, supplierId: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // ── Fetch supplier returns (separate query, not in Promise.all because
  //    it's simpler to keep it readable) ──
  const returns = await prisma.supplierReturn.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qty: true, unitCost: true } },
    },
  });

  // ── POs serialization ──
  const poHasMore = pos.length > BATCH_SIZE;
  const poBatch = poHasMore ? pos.slice(0, BATCH_SIZE) : pos;
  const poDraftCount = poBatch.filter((p) => p.status === "DRAFT").length;
  const poLastItem = poBatch[poBatch.length - 1];
  const poNextCursor = poHasMore && poLastItem
    ? `${poLastItem.createdAt.toISOString()}|${poLastItem.id}`
    : null;

  const poItems = poBatch.map((p) => {
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

  const directPurchaseItems: DirectPurchaseListItem[] = directPurchases.map((d) => ({
    id: d.id,
    billNumber: d.billNumber,
    supplierName: d.supplier?.name ?? d.supplierName,
    locationName: d.location.name,
    billDate: d.billDate.toISOString(),
    billAmount: toNum(d.billAmount),
    status: d.status,
    lineCount: d.lines.length,
  }));

  const poExportColumns: MobileColumnSpec[] = [
    { key: "poNumber", label: "PO Number" },
    { key: "supplierName", label: "Supplier" },
    { key: "status", label: "Status" },
    { key: "total", label: "Amount", format: "currency" },
    { key: "createdAt", label: "Created Date", format: "date" },
  ];

  // ── Indents serialization ──
  const reqHasMore = reqs.length > BATCH_SIZE;
  const reqBatch = reqHasMore ? reqs.slice(0, BATCH_SIZE) : reqs;
  const reqSubmittedCount = reqBatch.filter((r) => r.status === "SUBMITTED").length;
  const reqLastItem = reqBatch[reqBatch.length - 1];
  const reqNextCursor = reqHasMore && reqLastItem
    ? `${reqLastItem.createdAt.toISOString()}|${reqLastItem.id}`
    : null;

  const indentItems = reqBatch.map((r) => ({
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

  const indentExportColumns: MobileColumnSpec[] = [
    { key: "reqNumber", label: "Indent #" },
    { key: "projectName", label: "Project" },
    { key: "status", label: "Status" },
    { key: "lineCount", label: "Total Items" },
    { key: "createdAt", label: "Created Date", format: "date" },
    { key: "neededByDate", label: "Needed By", format: "date" },
    { key: "requestedByName", label: "Requested By" },
  ];

  // ── Quotations serialization ──
  let pendingIds = new Set<string>();
  if (membership) {
    const directReports = await prisma.userCompany.findMany({
      where: { reportsToUserCompanyId: membership.id },
      select: { id: true },
    });
    const reportIds = new Set(directReports.map((r) => r.id));
    pendingIds = new Set(
      quotationRequests
        .filter((r) => reportIds.has(r.submittedByUserCompanyId))
        .map((r) => r.id),
    );
  }

  const quotationItems = quotationRequests.map((r) => {
    const quotes = r.quotes;
    const cheapest = quotes.find((q) => q.isCheapest);
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      status: r.status,
      projectName: r.project?.name ?? null,
      projectId: r.project?.id ?? null,
      submittedByName: r.submittedBy?.name ?? "—",
      createdAt: r.createdAt.toISOString(),
      lineCount: r.lines.length,
      quoteCount: quotes.length,
      minQuotesRequired: r.minQuotesRequired,
      quotesMet: quotes.length >= r.minQuotesRequired,
      selectedQuoteId: r.selectedQuoteId ?? null,
      cheapestLandedTotal: cheapest ? toNum(cheapest.landedTotal) : null,
      isPendingMyApproval: pendingIds.has(r.id),
      convertedPo: r.convertedPo
        ? {
            id: r.convertedPo.id,
            poNumber: r.convertedPo.poNumber,
            status: r.convertedPo.status,
          }
        : null,
    };
  });

  const quotationCatalog = {
    projects: quotationProjects.map((p) => ({ id: p.id, name: p.name })),
    materials: quotationMaterials.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      unit: m.unit,
      hsnCode: m.hsnCode,
      gstRate: m.gstRate.toNumber(),
    })),
  };

  const quotationExportColumns: MobileColumnSpec[] = [
    { key: "requestNumber", label: "Request #" },
    { key: "title", label: "Title" },
    { key: "projectName", label: "Project" },
    { key: "status", label: "Status" },
    { key: "quoteCount", label: "Quotes" },
    { key: "cheapestLandedTotal", label: "Cheapest Total", format: "currency" },
    { key: "createdAt", label: "Created", format: "date" },
  ];

  // ── Returns serialization ──
  const returnDraft = returns.filter((r) => r.status === "DRAFT");
  const returnSubmitted = returns.filter((r) => r.status === "SUBMITTED");
  const returnTotalValue = returns
    .filter((r) => r.status !== "CANCELLED")
    .reduce((s, r) => s + r.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0), 0);

  const returnItems = returns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    creditNoteNo: r.creditNoteNo,
    supplierName: r.supplier.name,
    totalValue: r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
  }));

  const returnExportColumns: MobileColumnSpec[] = [
    { key: "returnNumber", label: "Return #" },
    { key: "supplierName", label: "Supplier" },
    { key: "returnDate", label: "Return Date", format: "date" },
    { key: "status", label: "Status" },
    { key: "totalValue", label: "Total Amount", format: "currency" },
  ];

  // ── Form data serialization (for FAB popup forms) ──
  const indentFormData = {
    projects: quotationProjects.map((p) => ({ id: p.id, name: p.name })),
    materials: quotationMaterials.map((m) => ({ id: m.id, name: m.name, code: m.code, unit: m.unit })),
    suppliers: formSuppliers.map((s) => ({ id: s.id, name: s.name })),
  };

  const poFormData = {
    suppliers: formSuppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone })),
    projects: quotationProjects.map((p) => ({ id: p.id, name: p.name })),
    materials: quotationMaterials.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      unit: m.unit,
      gstRate: m.gstRate.toNumber(),
      barcode: null,
    })),
    locations: formLocations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId })),
    categories: formCategories.map((c) => ({ id: c.id, name: c.name, unit: c.unit })),
  };

  const returnFormData = {
    suppliers: formSuppliers.map((s) => ({ id: s.id, name: s.name })),
    locations: formLocations.map((l) => ({ id: l.id, name: l.name, type: l.type })),
    materials: quotationMaterials.map((m) => ({ id: m.id, name: m.name, code: m.code, unit: m.unit })),
    purchaseOrders: formPurchaseOrders.map((p) => ({ id: p.id, poNumber: p.poNumber, supplierId: p.supplierId })),
    categories: formCategories.map((c) => ({ id: c.id, name: c.name, unit: c.unit })),
  };

  return (
    <MobileProcurementHubTabs
      indentItems={indentItems}
      indentCanCreate={canCreate}
      indentCanApprove={canApproveRequisition}
      indentSubmittedCount={reqSubmittedCount}
      indentLoadMoreUrl="/api/mobile/list/requisitions"
      indentNextCursor={reqNextCursor}
      indentExportColumns={indentExportColumns}
      indentFormData={indentFormData}
      quotationItems={quotationItems}
      quotationCanCreate={canCreateQuotation}
      quotationCatalog={quotationCatalog}
      quotationExportColumns={quotationExportColumns}
      poItems={poItems}
      poCanCreate={canCreate}
      poCanApprove={canApprove}
      poDraftCount={poDraftCount}
      poLoadMoreUrl="/api/mobile/list/procurement"
      poNextCursor={poNextCursor}
      poExportColumns={poExportColumns}
      poDirectPurchases={directPurchaseItems}
      poDirectPurchaseExportRows={directPurchaseItems as unknown as Record<string, unknown>[]}
      poFormData={poFormData}
      returnItems={returnItems}
      returnCanCreate={canCreate}
      returnTotalValue={returnTotalValue}
      returnPendingCount={returnDraft.length + returnSubmitted.length}
      returnExportColumns={returnExportColumns}
      returnFormData={returnFormData}
    />
  );
}
