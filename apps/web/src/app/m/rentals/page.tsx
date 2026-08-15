import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileRentalsList, type RentalListItem } from "./MobileRentalsList";

/**
 * /m/rentals — mobile rental/lease management.
 *
 * Purpose: a property manager opens this to see:
 *   1. How much monthly rent is coming in (the income pulse)
 *   2. Which tenants haven't paid (overdue — needs chasing)
 *   3. Which leases are expiring soon (renewal planning)
 *   4. Contact a tenant to follow up on rent
 *
 * Rentals are recurring revenue — the page is organized around
 * payment collection and lease lifecycle, not just a flat list.
 */
export default function MobileRentalsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRentalsContent />
    </Suspense>
  );
}

async function MobileRentalsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.SALE_CREATE);

  const [tenancies, units, parcels, customers] = await Promise.all([
    prisma.tenancy.findMany({
      where: { companyId: company.id, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: [{ status: "asc" }, { endDate: "asc" }],
      include: {
        payments: {
          orderBy: { dueDate: "desc" },
          select: { amount: true, dueDate: true, status: true, paymentDate: true },
        },
      },
    }),
    prisma.builtUnit.findMany({
      where: { project: { companyId: company.id }, deletedAt: null, status: { in: ["AVAILABLE", "UNDER_CONSTRUCTION"] } },
      select: { id: true, unitNumber: true, project: { select: { name: true } } },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id }, status: "AVAILABLE" },
      select: { id: true, number: true, landPurchase: { select: { sellerName: true, location: true } } },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const unitMap = new Map(units.map((u) => [u.id, { label: u.unitNumber, project: u.project.name }]));
  const parcelMap = new Map(parcels.map((p) => [p.id, { label: `Parcel ${p.number}`, project: p.landPurchase.location ?? p.landPurchase.sellerName }]));

  const now = new Date();

  const rows: RentalListItem[] = tenancies.map((t) => {
    const unit = t.builtUnitId ? unitMap.get(t.builtUnitId) : null;
    const parcel = t.landParcelId ? parcelMap.get(t.landParcelId) : null;
    const assetLabel = unit?.label ?? parcel?.label ?? "—";
    const projectName = unit?.project ?? parcel?.project ?? null;

    const totalReceived = t.payments
      .filter((p) => p.status === "RECEIVED")
      .reduce((s, p) => s + toNum(p.amount), 0);

    const overduePayments = t.payments.filter((p) => p.status === "OVERDUE");
    const overdueAmount = overduePayments.reduce((s, p) => s + toNum(p.amount), 0);

    const pendingPayments = t.payments.filter((p) => p.status === "PENDING");
    const nextDuePayment = pendingPayments
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

    const endDate = new Date(t.endDate);
    const daysToExpiry = Math.floor((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const expiringSoon = t.status === "ACTIVE" && daysToExpiry <= 30 && daysToExpiry >= 0;
    const expired = daysToExpiry < 0;

    return {
      id: t.id,
      tenantName: t.tenantName,
      tenantPhone: t.tenantPhone ?? null,
      tenantEmail: t.tenantEmail ?? null,
      status: t.status,
      assetLabel,
      projectName,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      monthlyRent: toNum(t.monthlyRent),
      securityDeposit: toNum(t.securityDeposit),
      rentAgreementNo: t.rentAgreementNo ?? null,
      totalReceived,
      overdueAmount,
      overdueCount: overduePayments.length,
      nextDueDate: nextDuePayment ? nextDuePayment.dueDate.toISOString() : null,
      nextDueAmount: nextDuePayment ? toNum(nextDuePayment.amount) : null,
      daysToExpiry,
      expiringSoon,
      expired,
      paymentCount: t.payments.length,
    };
  });

  const active = rows.filter((t) => t.status === "ACTIVE");
  const pending = rows.filter((t) => t.status === "PENDING");
  const totalMonthlyRent = active.reduce((s, t) => s + t.monthlyRent, 0);
  const totalReceived = rows.reduce((s, t) => s + t.totalReceived, 0);
  const totalOverdue = rows.reduce((s, t) => s + t.overdueAmount, 0);
  const expiringCount = rows.filter((t) => t.expiringSoon).length;

  return (
    <MobileRentalsList
      items={rows}
      stats={{
        totalMonthlyRent,
        totalReceived,
        totalOverdue,
        activeCount: active.length,
        pendingCount: pending.length,
        expiringCount,
      }}
      canManage={canManage}
      unitAssets={units.map((u) => ({ id: u.id, label: `${u.unitNumber} · ${u.project.name}` }))}
      parcelAssets={parcels.map((p) => ({ id: p.id, label: `Parcel ${p.number} · ${p.landPurchase.location ?? p.landPurchase.sellerName}` }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
