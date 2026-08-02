import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SalesView } from "@/components/sales/sales-view";
import { PageLoading } from "@/components/page-loading";
import type { AssetSaleRow, CustomerRow } from "@/lib/types";

export default function SalesPage() {
  return (
    <div className="space-y-5">
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
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const [sales, customers] = await Promise.all([
    prisma.assetSale.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        project: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "asc" } },
      },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assetSales: { where: { status: "ACTIVE" } } } },
      },
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
      projectName: s.project.name,
      salePrice: toNum(s.salePrice),
      costBasis: toNum(s.costBasis),
      profit: toNum(s.profit),
      saleDate: s.saleDate.toISOString(),
      status: s.status,
      paymentStatus: s.paymentStatus,
      paymentMode: s.paymentMode,
      notes: s.notes,
      totalPaid,
      balanceDue: toNum(s.salePrice) - totalPaid,
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
        description="Asset sales — land parcels and built units. Payments, profit, and cancellation."
        stats={[
          { label: "Sales", value: saleRows.length },
          { label: "Revenue", value: formatCurrency(revenue) },
          { label: "Collected", value: formatCurrency(collected) },
        ]}
      />
      <SalesView sales={saleRows} customers={customerRows} permissions={perms} />
    </>
  );
}
