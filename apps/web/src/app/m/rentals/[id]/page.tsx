import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { MobileRentalDetailClient } from "./MobileRentalDetailClient";

/**
 * /m/rentals/[id] — tenancy detail.
 *
 * Purpose: a property manager opens this to:
 *   1. See the lease terms (rent, deposit, dates, agreement no)
 *   2. Call the tenant about rent
 *   3. Record a rent payment
 *   4. Check payment history — who paid what and when
 *   5. Activate a pending lease or terminate an active one
 */
export default function MobileRentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading tenancy…" />}>
      <MobileRentalDetailContent params={params} />
    </Suspense>
  );
}

async function MobileRentalDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const canManage = hasPermission(role, PERM.SALES_MANAGE);
  const canSell = hasPermission(role, PERM.SALE_CREATE);

  const tenancy = await prisma.tenancy.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { dueDate: "desc" } },
    },
  });

  if (!tenancy) {
    return (
      <MobileRentalDetailClient notFound canManage={canManage} canSell={canSell} />
    );
  }

  // Get asset name
  const [unit, parcel] = await Promise.all([
    tenancy.builtUnitId
      ? prisma.builtUnit.findFirst({
          where: { id: tenancy.builtUnitId, deletedAt: null },
          select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true },
        })
      : null,
    tenancy.landParcelId
      ? prisma.landParcel.findFirst({
          where: { id: tenancy.landParcelId, deletedAt: null },
          select: { id: true, number: true, area: true, areaUnit: true, landPurchaseId: true },
        })
      : null,
  ]);

  const assetLabel = unit?.unitNumber ?? parcel ? `Parcel ${parcel?.number}` : "—";
  const assetType = tenancy.assetType;
  const assetArea = unit ? toNum(unit.area) : parcel ? toNum(parcel.area) : null;
  const assetAreaUnit = unit?.areaUnit ?? parcel?.areaUnit ?? null;

  const totalReceived = tenancy.payments
    .filter((p) => p.status === "RECEIVED")
    .reduce((s, p) => s + toNum(p.amount), 0);

  const overduePayments = tenancy.payments.filter((p) => p.status === "OVERDUE");
  const overdueAmount = overduePayments.reduce((s, p) => s + toNum(p.amount), 0);

  const now = new Date();
  const endDate = new Date(tenancy.endDate);
  const daysToExpiry = Math.floor((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  // Total expected rent for the lease duration
  const startDate = new Date(tenancy.startDate);
  const leaseMonths = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const totalExpectedRent = leaseMonths * toNum(tenancy.monthlyRent);

  const data = {
    id: tenancy.id,
    tenantName: tenancy.tenantName,
    tenantPhone: tenancy.tenantPhone,
    tenantEmail: tenancy.tenantEmail,
    status: tenancy.status,
    assetType,
    assetLabel,
    assetArea,
    assetAreaUnit,
    builtUnitId: tenancy.builtUnitId,
    landParcelId: tenancy.landParcelId,
    landPurchaseId: parcel?.landPurchaseId ?? null,
    projectName: tenancy.project?.name ?? null,
    customerId: tenancy.customerId,
    customerName: tenancy.customer?.name ?? null,
    customerPhone: tenancy.customer?.phone ?? null,
    customerEmail: tenancy.customer?.email ?? null,
    startDate: tenancy.startDate.toISOString(),
    endDate: tenancy.endDate.toISOString(),
    monthlyRent: toNum(tenancy.monthlyRent),
    securityDeposit: toNum(tenancy.securityDeposit),
    rentAgreementNo: tenancy.rentAgreementNo,
    notes: tenancy.notes,
    totalReceived,
    totalExpectedRent,
    overdueAmount,
    overdueCount: overduePayments.length,
    daysToExpiry,
    leaseMonths,
    payments: tenancy.payments.map((p) => ({
      id: p.id,
      amount: toNum(p.amount),
      paymentDate: p.paymentDate.toISOString(),
      dueDate: p.dueDate.toISOString(),
      mode: p.mode,
      reference: p.reference,
      status: p.status,
    })),
  };

  return (
    <MobileRentalDetailClient
      data={data}
      canManage={canManage}
      canSell={canSell}
    />
  );
}
