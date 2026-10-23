import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getActingRole, getCompany, getCompanyGroupIds, getCurrentUser, getCurrentUserMembership, toNum, scopeWhere, projectScopeFilter, getEffectivePermissions } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM } from "@/lib/roles";
import { canAutoApprove } from "@nirman/services";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { ProcurementView } from "@/components/procurement/procurement-view";
import { PageLoading } from "@/components/page-loading";
import type {
  SupplierRow, PurchaseOrderRow, MaterialRow, StockLocationRow,
  ProjectOption, DirectPurchaseRow, MaterialCategory,
  RequisitionRow, SupplierReturnRow, QuotationRequestRow} from "@/lib/types";

import { NoAccess } from "@/components/no-access";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";
export default function ProcurementPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading procurement…" variant="board" />}>
        <ProcurementContent />
      </Suspense>
    </div>
  );
}

async function ProcurementContent() {
  await connection();
  const actingRole = await getActingRole();
  const __effPerms = await getEffectivePermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.PROCUREMENT_VIEW)) {
    return (
      <NoAccess what="purchase orders" permission={PERM.PROCUREMENT_VIEW} />
    );
  }

  const perms = {
    canCreate: __effPerms.includes(PERM.PROCUREMENT_MANAGE),
    canCreateRequisition: __effPerms.includes(PERM.REQUISITION_CREATE),
    canApprove: __effPerms.includes(PERM.PO_APPROVE),
    canSelfApprove: canAutoApprove(actingRole),
    canManagePayments: __effPerms.includes(PERM.FINANCE_MANAGE),
    canApproveRequisitions: __effPerms.includes(PERM.REQUISITION_APPROVE),
    canReceiveGoods: __effPerms.includes(PERM.PROCUREMENT_MANAGE) || __effPerms.includes(PERM.INVENTORY_MANAGE)};

  // Company group: current company + siblings/parent/children. PO destination
  // locations (a project site in a sibling/child SPV) are selectable across
  // the group, matching the parent/child company hierarchy.
  const groupCompanyIds = await getCompanyGroupIds(company);
  const membership = await getCurrentUserMembership();
  const currentUser = await getCurrentUser();

  // Every list query fetches cap + 1 rows so applyCap can tell "exactly
  // at the cap" from "there are more rows hidden" — a hard `take: 500`
  // can't distinguish the two and would truncate silently.
  const cappedLabels: string[] = [];
  const capQ = (label: string, cap = LIST_CAP) => <T,>(rows: T[]): T[] => {
    const r = applyCap(rows, cap);
    if (r.capped) cappedLabels.push(label);
    return r.rows;
  };
  const [pos, suppliers, materials, locations, projects, directPurchases, categories, requisitions, phases, supplierReturns, quotationRequests, directReports] = await Promise.all([
    prisma.purchaseOrder.findMany({
      take: LIST_CAP + 1,
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        destinationLocation: { select: { id: true, name: true, type: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } }}}).then(capQ("purchase orders")),
    prisma.supplier.findMany({
      take: LIST_CAP + 1,
      // All non-deleted suppliers in this company — not just those with existing POs.
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            purchaseOrders: { where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } } }}}}).then(capQ("suppliers")),
    prisma.material.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true, unit: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id }, ...(await scopeWhere("StockLocationItem")) },
          select: { qty: true, movingAvgCost: true }}}}).then(capQ("materials")),
    prisma.stockLocation.findMany({
      take: LIST_CAP + 1,
      // Include locations across the whole company group so PO destinations
      // (a project site in a sibling/child SPV) are selectable.
      where: { ...await scopeWhere("StockLocation"), companyId: { in: groupCompanyIds }, deletedAt: null },
      orderBy: [{ companyId: "asc" }, { type: "asc" }, { name: "asc" }],
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } }}}).then(capQ("locations")),
    prisma.project.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null, ...await projectScopeFilter() ?? {} },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true }}).then(capQ("projects", 200)),
    prisma.directPurchase.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id },
      orderBy: { billDate: "desc" },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        location: { select: { id: true, name: true } },
        lines: {
          include: {
            material: { select: { id: true, code: true, name: true, unit: true } }}}}}).then(capQ("cash purchases")),
    // Company-scoped catalog entity; needed by the inline material
    // creator inside the PO form's line items.
    prisma.materialCategory.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true }}).then(capQ("material categories", 200)),
    // ── Requisitions (indents) — for the Indents tab ──
    prisma.materialRequisition.findMany({
      take: LIST_CAP + 1,
      where: {
        ...await scopeWhere("MaterialRequisition"),
        OR: [
          { project: { companyId: company.id, deletedAt: null } },
          { department: { companyId: company.id, deletedAt: null } },
        ]},
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        phase: { select: { name: true } },
        lines: {
          include: { material: { select: { code: true, name: true, unit: true } } }},
        vendorQuotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, isCheapest: true, status: true }}}}).then(capQ("indents")),
    // Project phases — needed by the requisitions view's phase selector
    prisma.projectPhase.findMany({
      take: 201,
      where: {...await scopeWhere("ProjectPhase"),  project: { companyId: company.id, deletedAt: null } },
      select: { id: true, name: true, projectId: true }}).then(capQ("project phases", 200)),
    // ── Supplier returns — for the Returns tab ──
    prisma.supplierReturn.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        lines: {
          include: { material: { select: { code: true, name: true, unit: true } } }}}}).then(capQ("supplier returns")),
    // ── Quotation requests — for the Quotations tab ──
    prisma.quotationRequest.findMany({
      where: { ...await scopeWhere("QuotationRequest"), companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 101,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        lines: { select: { id: true } },
        quotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, status: true, isCheapest: true }},
        convertedPo: { select: { id: true, poNumber: true, status: true } }}}).then(capQ("quotations", 100)),
    // Direct reports — for the "Your approval" badge on quotation requests
    membership
      ? prisma.userCompany.findMany({
          take: 200,
          where: { reportsToUserCompanyId: membership.id, user: { isHidden: { not: true } } },
          select: { id: true }})
      : [],
  ]);

  const poRows: PurchaseOrderRow[] = pos.map((po) => {
    const totalOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
    const totalReceived = po.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0);
    return {
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      procurementScope: po.procurementScope,
      projectId: po.projectId,
      projectName: po.project?.name ?? null,
      destinationLocationId: po.destinationLocationId,
      destinationLocationName: po.destinationLocation.name,
      destinationLocationType: po.destinationLocation.type,
      status: po.status,
      orderDate: po.orderDate.toISOString(),
      expectedDate: po.expectedDate?.toISOString() ?? null,
      subtotal: toNum(po.subtotal),
      gstTotal: toNum(po.gstTotal),
      total: toNum(po.total),
      notes: po.notes,
      totalOrdered,
      totalReceived,
      receivedPct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
      createdAt: po.createdAt.toISOString(),
      createdById: po.createdById};
  });

  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin,
    pan: s.pan,
    tdsSection: s.tdsSection,
    tdsRate: s.tdsRate != null ? toNum(s.tdsRate) : null,
    phone: s.phone,
    email: s.email,
    address: s.address,
    balanceOwed: toNum(s.balanceOwed),
    openPOs: s._count.purchaseOrders,
    poCount: s._count.purchaseOrders,
    leadTimeDays: s.leadTimeDays}));

  const categoryRows: MaterialCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit}));

  const materialRows: MaterialRow[] = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = m.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
    return {
      id: m.id, code: m.code, name: m.name, grade: m.grade, specification: m.specification, categoryId: m.categoryId,
      categoryName: m.category.name, unit: m.unit, hsnCode: m.hsnCode,
      gstRate: toNum(m.gstRate), standardCost: toNum(m.standardCost),
      minStock: m.minStock == null ? null : toNum(m.minStock),
      reorderPoint: m.reorderPoint == null ? null : toNum(m.reorderPoint),
      economicOrderQty: m.economicOrderQty == null ? null : toNum(m.economicOrderQty),
      volumetricDensity: m.volumetricDensity == null ? null : toNum(m.volumetricDensity),
      bulkDiscountPct: m.bulkDiscountPct == null ? null : toNum(m.bulkDiscountPct),
      isCorporateCommodity: m.isCorporateCommodity ?? false,
      isLotTracked: m.isLotTracked ?? false,
      isScrap: m.isScrap ?? false,
      baseUnit: m.baseUnit,
      secondaryUnit: m.secondaryUnit,
      uomConversionFactor: m.uomConversionFactor == null ? null : toNum(m.uomConversionFactor),
      description: m.description, totalQty, totalValue,
      lowStock: m.minStock != null && totalQty < toNum(m.minStock)};
  });

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id, type: l.type, name: l.name, address: l.address,
    projectId: l.projectId, projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    companyId: l.company.id,
    companyName: l.company.name,
    lat: l.lat,
    lng: l.lng,
    geoRadius: l.geoRadius}));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status}));

  const directPurchaseRows: DirectPurchaseRow[] = directPurchases.map((p) => ({
    id: p.id,
    billNumber: p.billNumber,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    supplierPhone: p.supplier?.phone ?? null,
    locationId: p.locationId,
    locationName: p.location.name,
    billDate: p.billDate.toISOString(),
    subtotal: toNum(p.subtotal),
    gstTotal: toNum(p.gstTotal),
    roundOff: toNum(p.roundOff),
    billAmount: toNum(p.billAmount),
    notes: p.notes,
    lineCount: p.lines.length,
    status: p.status,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    vehicleNumber: p.vehicleNumber,
    vehicleType: p.vehicleType,
    driverName: p.driverName,
    driverPhone: p.driverPhone,
    lines: p.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      gstRate: toNum(l.gstRate),
      lineTotal: toNum(l.qty) * toNum(l.unitCost)}))}));

  // ── Requisition rows (for Indents tab) ──
  const requisitionRows: RequisitionRow[] = requisitions.map((r) => ({
    id: r.id,
    reqNumber: r.reqNumber,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    phaseId: r.phaseId,
    phaseName: r.phase?.name ?? null,
    status: r.status,
    requestDate: r.requestDate.toISOString(),
    neededByDate: r.neededByDate?.toISOString() ?? null,
    notes: r.notes,
    convertedPoId: r.convertedPoId,
    lineCount: r.lines.length,
    totalQty: r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0),
    requestedById: r.requestedById,
    quoteCount: r.vendorQuotes.length,
    minQuotesRequired: r.minQuotesRequired,
    quotesWaived: r.quotesWaived,
    hasWinningQuote: r.vendorQuotes.some((q) => q.status === "SELECTED"),
    lciDecision: r.lciDecision as { recommendedScope: "COMPANY" | "PROJECT"; threshold: number } | null}));

  // ── Supplier return rows (for Returns tab) ──
  const supplierReturnRows: SupplierReturnRow[] = supplierReturns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    purchaseOrderId: r.purchaseOrderId,
    locationId: r.locationId,
    locationName: r.location.name,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    creditNoteNo: r.creditNoteNo,
    notes: r.notes,
    vehicleNumber: r.vehicleNumber,
    vehicleType: r.vehicleType,
    vehiclePhotoUrl: r.vehiclePhotoUrl,
    driverName: r.driverName,
    driverPhone: r.driverPhone,
    lines: r.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      materialUnit: l.material.unit,
      qty: toNum(l.qty),
      reason: l.reason}))}));

  // ── Quotation request rows (for Quotations tab) ──
  const reportIds = new Set(directReports.map((r) => r.id));
  const quotationRequestRows: QuotationRequestRow[] = quotationRequests.map((r) => {
    const cheapest = r.quotes.find((q) => q.isCheapest);
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      workActivity: r.workActivity ?? null,
      requiredByDate: r.requiredByDate?.toISOString() ?? null,
      submittedByUserCompanyId: r.submittedByUserCompanyId,
      submittedByName: r.submittedBy?.name ?? null,
      status: r.status,
      minQuotesRequired: r.minQuotesRequired,
      quoteCount: r.quotes.length,
      cheapestLandedTotal: cheapest ? toNum(cheapest.landedTotal) : null,
      convertedPoId: r.convertedPo?.id ?? null,
      convertedPoNumber: r.convertedPo?.poNumber ?? null,
      createdAt: r.createdAt.toISOString()};
  });

  const openPoValue = poRows
    .filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status))
    .reduce((s, p) => s + toNum(p.total), 0);

  const pendingRequisitions = requisitionRows.filter((r) => r.status === "SUBMITTED").length;

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Buy materials — indents, quotations, purchase orders, cash purchases, returns, and your supplier directory."
        stats={[
          { label: "POs", value: poRows.length, hint: "Total purchase orders across all statuses — draft, approved, ordered, received." },
          { label: "Open value", value: formatCurrency(openPoValue), hint: "Value of POs not yet fully received or paid. This is committed spend." },
          { label: "Indents", value: pendingRequisitions, tone: pendingRequisitions > 0 ? "warning" : "muted", hint: "Material indents submitted and awaiting approval." },
        ]}
      />
      <DepartmentActivityFeed department="procurement" />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <ProcurementView
        suppliers={supplierRows}
        purchaseOrders={poRows}
        materials={materialRows}
        locations={locationRows}
        projects={projectRows}
        directPurchases={directPurchaseRows}
        categories={categoryRows}
        requisitions={requisitionRows}
        phases={phases.map((p) => ({ id: p.id, name: p.name, projectId: p.projectId }))}
        supplierReturns={supplierReturnRows}
        quotationRequests={quotationRequestRows}
        reportIds={reportIds}
        permissions={perms}
        currentUserId={currentUser?.id ?? ""}
      />
    </>
  );
}
