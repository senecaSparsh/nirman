import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileSupplierPaymentsList, type SupplierPaymentListItem } from "./MobileSupplierPaymentsList";

/**
 * /m/supplier-payments — mobile supplier payments list. Shows recent
 * payments made to suppliers so finance can track outflows on the go.
 */
export default function MobileSupplierPaymentsPage() {
  return (
    <MobileListPage managePerm={PERM.FINANCE_MANAGE}>
      {async ({ company, canManage }) => {
        const BATCH_SIZE = 40;
        const payments = await prisma.supplierPayment.findMany({
          where: { companyId: company.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            supplier: { select: { id: true, name: true } },
            purchaseOrder: { select: { poNumber: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        });

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
            loadMoreUrl="/api/mobile/list/supplier-payments"
            initialCursor={nextCursor}
          />
        );
      }}
    </MobileListPage>
  );
}
