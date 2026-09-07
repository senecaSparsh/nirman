import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewSupplierPaymentClient } from "./MobileNewSupplierPaymentClient";

/**
 * /m/supplier-payments/new — standalone mobile form to record a
 * supplier payment. Fetches suppliers, open POs, and outstanding
 * invoices for the current company, then renders a client form
 * that POSTs to /api/supplier-payments.
 */
export default function MobileNewSupplierPaymentPage() {
  return (
    <MobileNewEntityPage perm={PERM.FINANCE_MANAGE} what="record supplier payments" permission="finance.manage" fields={6}>
      {async () => {
        const company = await getCompany();

        const [suppliers, openPos, outstandingInvoices] = await Promise.all([
          prisma.supplier.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, balanceOwed: true },
            take: 200,
          }),
          prisma.purchaseOrder.findMany({
            where: {
              companyId: company.id,
              supplierId: { not: undefined as unknown as string },
              status: { in: ["APPROVED", "ORDERED", "PARTIAL", "RECEIVED"] },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              poNumber: true,
              supplierId: true,
              total: true,
              status: true,
            },
            take: 100,
          }),
          prisma.supplierInvoice.findMany({
            where: {
              companyId: company.id,
              status: { in: ["PENDING", "PARTIAL"] },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              invoiceNumber: true,
              supplierId: true,
              totalAmount: true,
              status: true,
            },
            take: 100,
          }),
        ]);

        return (
          <MobileNewSupplierPaymentClient
            suppliers={suppliers.map((s) => ({
              id: s.id,
              name: s.name,
              balanceOwed: s.balanceOwed?.toString() ?? "0",
            }))}
            purchaseOrders={openPos.map((p) => ({
              id: p.id,
              poNumber: p.poNumber,
              supplierId: p.supplierId,
              total: p.total.toString(),
              status: p.status,
            }))}
            invoices={outstandingInvoices.map((i) => ({
              id: i.id,
              invoiceNumber: i.invoiceNumber,
              supplierId: i.supplierId,
              totalAmount: i.totalAmount.toString(),
              status: i.status,
            }))}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
