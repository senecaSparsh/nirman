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

  const [sales, customers, leads, projects, units, salesMembers] = await Promise.all([
    prisma.assetSale.findMany({
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
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assetSales: { where: { companyId: company.id, status: "ACTIVE" } } } },
      },
    }),
    prisma.lead.findMany({
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
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        project: { companyId: company.id, deletedAt: null },
      },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      select: { id: true, unitNumber: true, unitType: true, projectId: true, project: { select: { name: true } } },
    }),
    prisma.userCompany.findMany({
      where: {
        companyId: company.id,
        role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "SALES_MANAGER"] },
        user: { active: true },
      },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  // Fetch land parcels and built units separately (no direct relation on AssetSale)
  const landParcelIds = sales.filter((s) => s.landParcelId).map((s) => s.landParcelId!);
  const builtUnitIds = sales.filter((s) => s.builtUnitId).map((s) => s.builtUnitId!);

  const [landParcels, builtUnits] = await Promise.all([
    landParcelIds.length > 0
      ? prisma.landParcel.findMany({
          where: { id: { in: landParcelIds } },
          select: { id: true, number: true, area: true, areaUnit: true },
        })
      : [],
    builtUnitIds.length > 0
      ? prisma.builtUnit.findMany({
          where: { id: { in: builtUnitIds } },
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

  const revenue = saleRows.filter((s) => s.status !== "CANCELLED").reduce((s, r) => s + r.salePrice, 0);
  const collected = saleRows.filter((s) => s.status !== "CANCELLED").reduce((s, r) => s + r.totalPaid, 0);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Sales of land parcels and built units — bookings, payment plans, profit, and cancellations."
        stats={[
          { label: "Open Leads", value: leadRows.filter((lead) => !["BOOKED", "LOST"].includes(lead.stage)).length, hint: "Leads still moving through qualification and follow-up." },
          { label: "Sales", value: saleRows.length, hint: "Total number of sale records including bookings, active sales, and cancellations." },
          { label: "Revenue", value: formatCurrency(revenue), hint: "Sum of sale prices across all non-cancelled sales." },
          { label: "Collected", value: formatCurrency(collected), hint: "Total payments received across all non-cancelled sales." },
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
