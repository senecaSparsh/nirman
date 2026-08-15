import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Truck } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSupplierDetailClient } from "./MobileSupplierDetailClient";

export default function MobileSupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
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
      <div>
        <div className="mb-4">
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Truck className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Supplier not found
          </p>
        </div>
      </div>
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
    <MobileSupplierDetailClient
      supplierId={supplier.id}
      name={supplier.name}
      gstin={supplier.gstin}
      phone={supplier.phone}
      email={supplier.email}
      address={supplier.address}
      balanceOwed={balanceOwed}
      totalPoValue={totalPoValue}
      totalPaid={totalPaid}
      poCount={supplier.purchaseOrders.length}
      paymentCount={supplier.supplierPayments.length}
      pos={pos}
      payments={payments}
      canManage={canManage}
    />
  );
}
