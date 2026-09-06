import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Truck } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileSupplierDetailClient } from "./MobileSupplierDetailClient";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default function MobileSupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileSupplierDetailContent params={params} />
    </Suspense>
  );
}

async function MobileSupplierDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      purchaseOrders: {
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, poNumber: true, status: true, total: true,
          createdAt: true, expectedDate: true,
        },
      },
      supplierPayments: {
        where: { companyId: company.id },
        orderBy: { paymentDate: "desc" },
        take: 20,
        select: {
          id: true, paymentNumber: true, amount: true,
          paymentDate: true, paymentMode: true,
        },
      },
    },
  });

  if (!supplier) {
    return (
      <MobileEmptyState icon={Truck} title="Supplier not found" />
    );
  }

  const balanceOwed = toNum(supplier.balanceOwed);
  const totalPoValue = supplier.purchaseOrders.reduce((s, po) => s + toNum(po.total), 0);
  const totalPaid = supplier.supplierPayments.reduce((s, p) => s + toNum(p.amount), 0);

  const pos = supplier.purchaseOrders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    total: toNum(po.total),
    createdAt: po.createdAt.toISOString(),
    expectedDate: po.expectedDate?.toISOString() ?? null,
  }));

  const payments = supplier.supplierPayments.map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    amount: toNum(p.amount),
    paymentDate: p.paymentDate.toISOString(),
    paymentMode: p.paymentMode,
  }));

  return (
    <PageContextProvider value={{
      entityType: "supplier",
      label: supplier.name,
      subtitle: supplier.phone ?? undefined,
      recordId: supplier.id,
    }}>
    <>
      <RecordRecentItem type="supplier" id={supplier.id} label={supplier.name} sublabel={supplier.phone ?? undefined} href={`/m/suppliers/${supplier.id}`} />
      <MobileSupplierDetailClient
      supplierId={supplier.id}
      name={supplier.name}
      gstin={supplier.gstin}
      phone={supplier.phone}
      email={supplier.email}
      address={supplier.address}
      leadTimeDays={supplier.leadTimeDays ?? null}
      version={supplier.version}
      balanceOwed={balanceOwed}
      totalPoValue={totalPoValue}
      totalPaid={totalPaid}
      poCount={supplier.purchaseOrders.length}
      paymentCount={supplier.supplierPayments.length}
      pos={pos}
      payments={payments}
      canManage={canManage}
    />
    </>
    </PageContextProvider>
  );
}
