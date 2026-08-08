import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { RentalsView } from "@/components/rentals/rentals-view";

import { NoAccess } from "@/components/no-access";
export default function RentalsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading rentals…" variant="list" />}>
      <RentalsContent />
    </Suspense>
  );
}

async function RentalsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="rentals" />
    );
  }

  const perms = {
    canManage: hasPermission(role, PERM.SALE_CREATE),
    canTerminate: hasPermission(role, PERM.SALES_MANAGE),
  };

  const [tenancies, landParcels, builtUnits, customers, projects] = await Promise.all([
    prisma.tenancy.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        project: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "desc" } },
      },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "RENTED"] } },
      select: { id: true, number: true, area: true, areaUnit: true, projectId: true },
      orderBy: { number: "asc" },
    }),
    prisma.builtUnit.findMany({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "RENTED"] } },
      select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, projectId: true },
      orderBy: { unitNumber: "asc" },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const tenancyRows = tenancies.map((t) => {
    const totalReceived = t.payments.reduce((s, p) => s + toNum(p.amount), 0);
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
      securityDeposit: toNum(t.securityDeposit),
      rentAgreementNo: t.rentAgreementNo,
      status: t.status,
      notes: t.notes,
      totalReceived,
      paymentCount: t.payments.length,
      payments: t.payments.map((p) => ({
        id: p.id,
        amount: toNum(p.amount),
        paymentDate: p.paymentDate.toISOString(),
        dueDate: p.dueDate.toISOString(),
        mode: p.mode,
        reference: p.reference,
        status: p.status,
      })),
    };
  });

  return (
    <RentalsView
      tenancies={tenancyRows}
      landParcels={landParcels.map((p) => ({ id: p.id, label: `Parcel ${p.number} (${toNum(p.area)} ${p.areaUnit})`, projectId: p.projectId }))}
      builtUnits={builtUnits.map((u) => ({ id: u.id, label: `${u.unitNumber} (${u.unitType})`, projectId: u.projectId }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      permissions={perms}
    />
  );
}
