import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SupplierPaymentsView } from "@/components/finance/supplier-payments-view";
import type { SupplierRow } from "@/lib/types";
import { NoAccess } from "@/components/no-access";

export default function SupplierPaymentsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading supplier payments…" variant="list" />}>
        <SupplierPaymentsContent />
      </Suspense>
    </div>
  );
}

export async function SupplierPaymentsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="supplier payments" />;
  }

  // Fetch recent payments
  const payments = await prisma.supplierPayment.findMany({
    where: { companyId: company.id },
    orderBy: { paymentDate: "desc" },
    take: 200,
    include: {
      supplier: { select: { id: true, name: true } },
      purchaseOrder: { select: { poNumber: true } },
      invoice: { select: { invoiceNumber: true } },
      createdBy: { select: { name: true } },
    },
  });

  // Fetch suppliers for the payment form
  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, balanceOwed: true },
    orderBy: { name: "asc" },
  });

  const serialized = payments.map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    supplierId: p.supplierId,
    supplierName: p.supplier.name,
    purchaseOrderId: p.purchaseOrderId,
    poNumber: p.purchaseOrder?.poNumber ?? null,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoice?.invoiceNumber ?? null,
    amount: toNum(p.amount),
    tdsAmount: toNum(p.tdsAmount),
    tdsSection: p.tdsSection,
    netPaidAmount: toNum(p.netPaidAmount),
    paymentDate: p.paymentDate.toISOString(),
    paymentMode: p.paymentMode,
    referenceNo: p.referenceNo,
    chequePhotoUrl: p.chequePhotoUrl,
    notes: p.notes,
    createdByName: p.createdBy?.name ?? null,
  }));

  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: null,
    phone: null,
    email: null,
    address: null,
    balanceOwed: toNum(s.balanceOwed),
    openPOs: 0,
    poCount: 0,
    leadTimeDays: null,
  }));

  const totalPaid = serialized.reduce((s, p) => s + p.amount, 0);
  const totalTds = serialized.reduce((s, p) => s + p.tdsAmount, 0);
  const totalOutstanding = supplierRows.reduce((s, sup) => s + sup.balanceOwed, 0);

  return (
    <>
      <PageHeader
        title="Supplier Payments"
        description="Record and track all payments to suppliers — cheques, bank transfers, cash. TDS is automatically deducted and posted to GL."
        stats={[
          { label: "Total Paid", value: formatCurrency(totalPaid) },
          { label: "Total TDS Deducted", value: formatCurrency(totalTds) },
          { label: "Outstanding Balance", value: formatCurrency(totalOutstanding) },
          { label: "Payments", value: String(serialized.length) },
        ]}
      />
      <SupplierPaymentsView payments={serialized} suppliers={supplierRows} />
    </>
  );
}
