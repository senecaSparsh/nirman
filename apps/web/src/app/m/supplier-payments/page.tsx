import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSupplierPaymentsList, type SupplierPaymentListItem } from "./MobileSupplierPaymentsList";

/**
 * /m/supplier-payments — mobile supplier payments list. Shows recent
 * payments made to suppliers so finance can track outflows on the go.
 */
export default function MobileSupplierPaymentsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSupplierPaymentsContent />
    </Suspense>
  );
}

async function MobileSupplierPaymentsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.FINANCE_MANAGE);

  const payments = await prisma.supplierPayment.findMany({
    where: { companyId: company.id },
    orderBy: { paymentDate: "desc" },
    take: 80,
    include: {
      supplier: { select: { id: true, name: true } },
      purchaseOrder: { select: { poNumber: true } },
      invoice: { select: { invoiceNumber: true } },
    },
  });

  const rows: SupplierPaymentListItem[] = payments.map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    supplierName: p.supplier.name,
    poNumber: p.purchaseOrder?.poNumber ?? null,
    invoiceNumber: p.invoice?.invoiceNumber ?? null,
    amount: toNum(p.amount),
    paymentDate: p.paymentDate.toISOString(),
    paymentMode: p.paymentMode,
  }));

  const totalAmount = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <MobileSupplierPaymentsList
      items={rows}
      totalAmount={totalAmount}
      canManage={canManage}
    />
  );
}
