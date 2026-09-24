import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileSupplierPaymentsList, type SupplierPaymentListItem } from "./MobileSupplierPaymentsList";

/**
 * /m/supplier-payments — mobile supplier payments list. Shows recent
 * payments made to suppliers so finance can track outflows on the go.
 */
export default function MobileSupplierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  return (
    <MobileListPage perm={PERM.FINANCE_VIEW} managePerm={PERM.FINANCE_MANAGE}>
      {async ({ company, canManage, perms }) => {
        const canViewProcurement = perms.includes(PERM.PROCUREMENT_VIEW);
        const { supplierId: filterSupplierId } = await searchParams;
        const BATCH_SIZE = 40;
        const payments = await prisma.supplierPayment.findMany({
          where: { companyId: company.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            supplier: { select: { id: true, name: true } },
            purchaseOrder: { select: { id: true, poNumber: true } },
            invoice: { select: { invoiceNumber: true } }}});

        const hasMore = payments.length > BATCH_SIZE;
        const batch = hasMore ? payments.slice(0, BATCH_SIZE) : payments;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        const rows: SupplierPaymentListItem[] = batch.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          supplierName: p.supplier.name,
          poId: p.purchaseOrder?.id ?? null,
          supplierId: p.supplier.id,
          poNumber: p.purchaseOrder?.poNumber ?? null,
          invoiceNumber: p.invoice?.invoiceNumber ?? null,
          amount: toNum(p.amount),
          paymentDate: p.paymentDate.toISOString(),
          paymentMode: p.paymentMode,
          status: p.status}));

        const totalAmount = rows.reduce((s, p) => s + (p.status === "VOID" ? 0 : p.amount), 0);

        return (
          <div>
            <MobileSupplierPaymentsList
              items={rows}
              totalAmount={totalAmount}
              canManage={canManage}
              canViewProcurement={canViewProcurement}
              loadMoreUrl="/api/mobile/list/supplier-payments"
              initialCursor={nextCursor}
              filterSupplierId={filterSupplierId ?? null}
            />
            {canManage && <MobileFab href="/m/supplier-payments/new" label="Record payment" />}
          </div>
        );
      }}
    </MobileListPage>
  );
}
