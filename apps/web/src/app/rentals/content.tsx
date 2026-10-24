import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, projectScopeFilter, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { RentalsView } from "@/components/rentals/rentals-view";
import { formatCurrency } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";

export async function RentalsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.SALES_VIEW)) {
    return (
      <NoAccess what="rentals" permission={PERM.SALES_VIEW} />
    );
  }

  const perms = {
    canManage: __effPerms.includes(PERM.SALE_CREATE),
    canTerminate: __effPerms.includes(PERM.SALES_MANAGE),
  };

  const cappedLabels: string[] = [];
  const capQ = (label: string, cap = LIST_CAP) => <T,>(rows: T[]): T[] => {
    const r = applyCap(rows, cap);
    if (r.capped) cappedLabels.push(label);
    return r.rows;
  };
  const [tenancies, landParcels, builtUnits, customers, projects, tenancyStatusAgg] = await Promise.all([
    prisma.tenancy.findMany({
      take: LIST_CAP + 1,
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        project: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "desc" } },
      },
    }).then(capQ("tenancies")),
    prisma.landParcel.findMany({
      take: 201,
      where: { deletedAt: null, status: { in: ["AVAILABLE", "RENTED"] }, saleId: null, landPurchase: { companyId: company.id } },
      select: { id: true, number: true, area: true, areaUnit: true, projectId: true },
      orderBy: { number: "asc" },
    }).then(capQ("rentable land parcels", 200)),
    prisma.builtUnit.findMany({
      take: 201,
      where: { deletedAt: null, status: { in: ["AVAILABLE", "RENTED"] }, saleId: null, project: { companyId: company.id } },
      select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, projectId: true },
      orderBy: { unitNumber: "asc" },
    }).then(capQ("rentable units", 200)),
    prisma.customer.findMany({
      take: 201,
      where: { deletedAt: null, companyId: company.id },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }).then(capQ("customers", 200)),
    prisma.project.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null, ...await projectScopeFilter() ?? {} },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).then(capQ("projects", 200)),
    // Header stats come from complete aggregates — tenancies list is capped.
    prisma.tenancy.groupBy({
      by: ["status"],
      where: { companyId: company.id },
      _count: true,
      _sum: { monthlyRent: true },
    }),
  ]);

  const tenancyRows = tenancies.map((t) => {
    const totalReceived = t.payments.reduce((s, p) => s + (p.status === "RECEIVED" ? toNum(p.amount) : 0), 0);
    return {
      id: t.id,
      assetType: t.assetType,
      landParcelId: t.landParcelId,
      builtUnitId: t.builtUnitId,
      customerId: t.customerId,
      customerName: t.customer?.name ?? null,
      customerPhone: t.customer?.phone ?? null,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      tenantName: t.tenantName,
      tenantPhone: t.tenantPhone,
      tenantEmail: t.tenantEmail,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      monthlyRent: toNum(t.monthlyRent),
      baseRent: toNum(t.baseRent),
      securityDeposit: toNum(t.securityDeposit),
      rentAgreementNo: t.rentAgreementNo,
      rentAgreementDocumentUrl: t.rentAgreementDocumentUrl,
      rentAgreementDocumentName: t.rentAgreementDocumentName,
      sacCode: t.sacCode,
      escalationPercent: t.escalationPercent ? toNum(t.escalationPercent) : null,
      escalationIntervalMonths: t.escalationIntervalMonths,
      nextEscalationDate: t.nextEscalationDate ? t.nextEscalationDate.toISOString() : null,
      lastEscalatedAt: t.lastEscalatedAt ? t.lastEscalatedAt.toISOString() : null,
      rentFreeDays: t.rentFreeDays,
      draftDocumentUrl: t.draftDocumentUrl,
      draftDocumentName: t.draftDocumentName,
      draftNotes: t.draftNotes,
      draftDate: t.draftDate ? t.draftDate.toISOString() : null,
      status: t.status,
      notes: t.notes,
      totalReceived,
      paymentCount: t.payments.length,
      payments: t.payments.map((p) => ({
        id: p.id,
        amount: toNum(p.amount),
        tdsAmount: toNum(p.tdsAmount),
        tdsCertificateNo: p.tdsCertificateNo,
        netReceived: toNum(p.netReceived),
        paymentDate: p.paymentDate.toISOString(),
        dueDate: p.dueDate.toISOString(),
        mode: p.mode,
        reference: p.reference,
        status: p.status,
        periodStart: p.periodStart ? p.periodStart.toISOString() : null,
        periodEnd: p.periodEnd ? p.periodEnd.toISOString() : null,
      })),
    };
  });

  return (
    <>
      <PageHeader
        title="Rentals"
        description="Manage rental tenancies for land parcels and built units. Track agreements, security deposits, and monthly rent payments."
        stats={[
          { label: "Tenancies", value: tenancyStatusAgg.reduce((s, g) => s + g._count, 0), hint: "All rental agreements for land parcels and built units, including ended ones." },
          { label: "Active", value: tenancyStatusAgg.find((g) => g.status === "ACTIVE")?._count ?? 0, hint: "Tenancies currently in effect with an active tenant." },
          { label: "Monthly rent", value: formatCurrency(tenancyStatusAgg.reduce((s, g) => s + (g.status === "ACTIVE" ? toNum(g._sum.monthlyRent) : 0), 0)), hint: "Sum of current monthly rent across all active tenancies (before escalations)." },
        ]}
      />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <RentalsView
        tenancies={tenancyRows}
        landParcels={landParcels.map((p) => ({ id: p.id, label: `Parcel ${p.number} (${toNum(p.area)} ${p.areaUnit})`, projectId: p.projectId }))}
        builtUnits={builtUnits.map((u) => ({ id: u.id, label: `${u.unitNumber} (${u.unitType})`, projectId: u.projectId }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        permissions={perms}
      />
    </>
  );
}
