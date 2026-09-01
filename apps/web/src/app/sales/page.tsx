import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SalesView } from "@/components/sales/sales-view";
import { PageLoading } from "@/components/page-loading";
import type { AssetSaleRow, CustomerRow, LeadRow } from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function SalesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading sales…" variant="list" />}>
        <SalesContent />
      </Suspense>
    </div>
  );
}

async function SalesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="sales" />
    );
  }

  const [sales, customers, leads, projects, units, salesMembers, unitStats] = await Promise.all([
    prisma.assetSale.findMany({
      take: 500,
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        project: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "asc" } },
        expenses: { orderBy: { sortOrder: "asc" } },
        terms: { orderBy: { sortOrder: "asc" } },
        broker: { select: { id: true, name: true, phone: true, agency: true } },
        paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
      },
    }),
    prisma.customer.findMany({
      take: 500,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assetSales: { where: { companyId: company.id, status: "ACTIVE" } } } },
      },
    }),
    prisma.lead.findMany({
      take: 500,
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
      include: {
        project: { select: { id: true, name: true } },
        interestedUnit: { select: { id: true, unitNumber: true } },
        assignedTo: { select: { id: true, name: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 1 },
        _count: { select: { activities: true } },
      },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.builtUnit.findMany({
      take: 200,
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        project: { companyId: company.id, deletedAt: null },
      },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      select: { id: true, unitNumber: true, unitType: true, projectId: true, project: { select: { name: true } } },
    }),
    prisma.userCompany.findMany({
      take: 200,
      where: {
        companyId: company.id,
        role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "SALES_MANAGER"] },
        user: { active: true },
      },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
    prisma.builtUnit.groupBy({
      by: ["status"],
      where: { deletedAt: null, project: { companyId: company.id, deletedAt: null } },
      _count: true,
    }),
  ]);

  // Fetch land parcels and built units separately (no direct relation on AssetSale)
  const landParcelIds = sales.filter((s) => s.landParcelId).map((s) => s.landParcelId!);
  const builtUnitIds = sales.filter((s) => s.builtUnitId).map((s) => s.builtUnitId!);

  const [landParcels, builtUnits] = await Promise.all([
    landParcelIds.length > 0
      ? prisma.landParcel.findMany({
          take: 200,
          where: { id: { in: landParcelIds }, landPurchase: { companyId: company.id } },
          select: { id: true, number: true, area: true, areaUnit: true },
        })
      : [],
    builtUnitIds.length > 0
      ? prisma.builtUnit.findMany({
          take: 200,
          where: { id: { in: builtUnitIds }, project: { companyId: company.id } },
          select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true },
        })
      : [],
  ]);

  const parcelMap = new Map(landParcels.map((p) => [p.id, p]));
  const unitMap = new Map(builtUnits.map((u) => [u.id, u]));

  const saleRows: AssetSaleRow[] = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const parcel = s.landParcelId ? parcelMap.get(s.landParcelId) : null;
    const unit = s.builtUnitId ? unitMap.get(s.builtUnitId) : null;
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      assetType: s.assetType,
      landParcelId: s.landParcelId,
      landParcelNumber: parcel?.number ?? null,
      builtUnitId: s.builtUnitId,
      builtUnitNumber: unit?.unitNumber ?? null,
      builtUnitType: unit?.unitType ?? null,
      assetArea: parcel ? toNum(parcel.area) : unit ? toNum(unit.area) : null,
      assetAreaUnit: parcel?.areaUnit ?? unit?.areaUnit ?? null,
      customerId: s.customerId,
      customerName: s.customer.name,
      customerPhone: s.customer.phone,
      projectId: s.projectId,
      projectName: s.project?.name ?? null,
      salePrice: toNum(s.salePrice),
      gstRate: toNum(s.gstRate),
      gstAmount: toNum(s.gstAmount),
      costBasis: toNum(s.costBasis),
      profit: toNum(s.profit),
      saleDate: s.saleDate.toISOString(),
      status: s.status,
      saleStage: s.saleStage,
      depositAmount: s.depositAmount ? toNum(s.depositAmount) : null,
      depositDate: s.depositDate ? s.depositDate.toISOString() : null,
      finalSaleDate: s.finalSaleDate ? s.finalSaleDate.toISOString() : null,
      saleDeedNo: s.saleDeedNo,
      expectedRegistryDate: s.expectedRegistryDate ? s.expectedRegistryDate.toISOString() : null,
      // ATS (Agreement to Sell) — merged with registry
      atsNo: s.atsNo,
      atsDate: s.atsDate ? s.atsDate.toISOString() : null,
      allowRegistryBeforeFullPayment: s.allowRegistryBeforeFullPayment,
      // Sale compliance documents
      allotmentLetterNo: s.allotmentLetterNo,
      allotmentDate: s.allotmentDate ? s.allotmentDate.toISOString() : null,
      bbaNo: s.bbaNo,
      bbaDate: s.bbaDate ? s.bbaDate.toISOString() : null,
      // TDS tracking
      tdsAmount: s.tdsAmount ? toNum(s.tdsAmount) : null,
      tdsCertificateNo: s.tdsCertificateNo,
      // Home loan tracking
      homeLoanBank: s.homeLoanBank,
      homeLoanAmount: s.homeLoanAmount ? toNum(s.homeLoanAmount) : null,
      homeLoanSanctionNo: s.homeLoanSanctionNo,
      homeLoanSanctionDate: s.homeLoanSanctionDate ? s.homeLoanSanctionDate.toISOString() : null,
      // Deal terms
      dealMaturityMonths: s.dealMaturityMonths,
      dealMaturityDate: s.dealMaturityDate ? s.dealMaturityDate.toISOString() : null,
      paymentCycle: s.paymentCycle,
      // Broker / deal source
      dealSource: s.dealSource,
      brokerId: s.brokerId,
      brokerName: s.brokerName,
      brokerPhone: s.brokerPhone,
      brokerAgency: s.broker?.agency ?? null,
      commissionAmount: s.commissionAmount ? toNum(s.commissionAmount) : null,
      commissionIsPartOfDeal: s.commissionIsPartOfDeal,
      commissionPaid: s.commissionPaid,
      commissionPaidDate: s.commissionPaidDate ? s.commissionPaidDate.toISOString() : null,
      // Sale expenses
      expenses: s.expenses.map((e) => ({
        id: e.id,
        head: e.head,
        label: e.label,
        amount: toNum(e.amount),
        borneBy: e.borneBy,
        isIncluded: e.isIncluded,
      })),
      // Sale terms
      terms: s.terms.map((t) => ({
        id: t.id,
        description: t.description,
        extraAmount: t.extraAmount ? toNum(t.extraAmount) : null,
        isIncluded: t.isIncluded,
      })),
      // Payment schedule
      paymentSchedule: s.paymentSchedule
        ? {
            type: s.paymentSchedule.type,
            totalAmount: toNum(s.paymentSchedule.totalAmount),
            items: s.paymentSchedule.items.map((item) => ({
              id: item.id,
              installmentNo: item.installmentNo,
              description: item.description,
              percentage: toNum(item.percentage),
              amount: toNum(item.amount),
              dueDate: item.dueDate ? item.dueDate.toISOString() : null,
              status: item.status,
              paidAmount: toNum(item.paidAmount),
            })),
          }
        : null,
      paymentStatus: s.paymentStatus,
      paymentMode: s.paymentMode,
      notes: s.notes,
      totalPaid,
      balanceDue: toNum(s.salePrice) + toNum(s.gstAmount) - totalPaid,
      paymentCount: s.payments.length,
      // Document uploads
      atsDocumentUrl: s.atsDocumentUrl,
      atsDocumentName: s.atsDocumentName,
      bbaDocumentUrl: s.bbaDocumentUrl,
      bbaDocumentName: s.bbaDocumentName,
      registryDocumentUrl: s.registryDocumentUrl,
      registryDocumentName: s.registryDocumentName,
      allotmentDocumentUrl: s.allotmentDocumentUrl,
      allotmentDocumentName: s.allotmentDocumentName,
      // Draft / LOI
      draftDocumentUrl: s.draftDocumentUrl,
      draftDocumentName: s.draftDocumentName,
      draftNotes: s.draftNotes,
      draftDate: s.draftDate ? s.draftDate.toISOString() : null,
      // e-Invoicing (IRN + QR)
      irn: s.irn,
      irnAckNo: s.irnAckNo,
      irnAckDate: s.irnAckDate ? s.irnAckDate.toISOString() : null,
      irnQrCode: s.irnQrCode,
      irnStatus: s.irnStatus,
      irnError: s.irnError,
      irnGeneratedAt: s.irnGeneratedAt ? s.irnGeneratedAt.toISOString() : null,
      irnCancelledAt: s.irnCancelledAt ? s.irnCancelledAt.toISOString() : null,
    };
  });

  const customerRows: CustomerRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    gstin: c.gstin,
    address: c.address,
    activeSales: c._count.assetSales,
  }));

  const leadRows: LeadRow[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    priority: lead.priority,
    score: lead.score,
    budgetMin: lead.budgetMin == null ? null : toNum(lead.budgetMin),
    budgetMax: lead.budgetMax == null ? null : toNum(lead.budgetMax),
    interestedUnitType: lead.interestedUnitType,
    notes: lead.notes,
    projectId: lead.projectId,
    projectName: lead.project?.name ?? null,
    interestedUnitId: lead.interestedUnitId,
    interestedUnitLabel: lead.interestedUnit ? `Unit ${lead.interestedUnit.unitNumber}` : null,
    assignedToId: lead.assignedToId,
    assignedToName: lead.assignedTo?.name ?? null,
    convertedCustomerId: lead.convertedCustomerId,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    lostReason: lead.lostReason,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    activityCount: lead._count.activities,
    latestActivity: lead.activities[0] ? {
      type: lead.activities[0].type,
      note: lead.activities[0].note,
      outcome: lead.activities[0].outcome,
      occurredAt: lead.activities[0].occurredAt.toISOString(),
    } : null,
  }));

  const perms = {
    canCreateSale: hasPermission(role, PERM.SALE_CREATE),
    canManage: hasPermission(role, PERM.SALES_MANAGE),
  };

  // "Booked revenue" = sum of sale prices for non-cancelled sales.
  // This includes RESERVED (deposit only) — it's the total contract value,
  // not realized revenue. "Collected" is what's actually been received.
  const bookedRevenue = saleRows.filter((s) => s.status !== "CANCELLED").reduce((s, r) => s + r.salePrice, 0);
  const collected = saleRows.filter((s) => s.status !== "CANCELLED").reduce((s, r) => s + r.totalPaid, 0);

  // Unit inventory summary — "kitni unit bachi, kitni bik gayi"
  const unitCountByStatus = Object.fromEntries(unitStats.map((u) => [u.status, u._count]));
  const totalUnits = unitStats.reduce((s, u) => s + u._count, 0);
  const soldUnits = unitCountByStatus.SOLD ?? 0;
  const availableUnits = unitCountByStatus.AVAILABLE ?? 0;
  const reservedUnits = unitCountByStatus.RESERVED ?? 0;
  const _rentedUnits = unitCountByStatus.RENTED ?? 0;
  const _underConstruction = unitCountByStatus.UNDER_CONSTRUCTION ?? 0;

  return (
    <>
      <PageHeader
        title="Sales"
        description="Sales of land parcels and built units — bookings, payment plans, profit, and cancellations."
        stats={[
          { label: "Total Units", value: totalUnits, hint: "All built units across all projects (excluding deleted)." },
          { label: "Available", value: availableUnits, hint: "Units ready for sale and not yet booked or reserved." },
          { label: "Sold", value: soldUnits, tone: "success", hint: "Units with a completed sale (registry done). Booked units with deposit are in 'Reserved' below." },
          { label: "Reserved", value: reservedUnits, tone: "warning", hint: "Units with a deposit received but sale not yet completed." },
          { label: "Open Leads", value: leadRows.filter((lead) => !["BOOKED", "LOST"].includes(lead.stage)).length, hint: "Leads still moving through qualification and follow-up." },
          { label: "Booked", value: formatCurrency(bookedRevenue), tone: "success", hint: "Total contract value across all non-cancelled sales (includes reserved deposits). Not all of this is collected yet." },
          { label: "Collected", value: formatCurrency(collected), tone: "success", hint: "Total payments received across all non-cancelled sales. The gap between Booked and Collected is outstanding." },
        ]}
      />
      <SalesView
        leads={leadRows}
        sales={saleRows}
        customers={customerRows}
        projects={projects}
        units={units.map((unit) => ({
          id: unit.id,
          projectId: unit.projectId,
          label: `Unit ${unit.unitNumber} · ${unit.unitType.replaceAll("_", " ")}`,
          projectName: unit.project.name,
        }))}
        assignees={salesMembers.map((membership) => membership.user)}
        permissions={perms}
      />
    </>
  );
}
