import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Payment Voucher — internal document authorising
 * a payment to a supplier. Shows payment details, TDS breakdown,
 * and approval signatures. Used for audit trail and bank reconciliation.
 */
export default async function SupplierPaymentPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const payment = await prisma.supplierPayment.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { name: true, phone: true, gstin: true, address: true } },
      purchaseOrder: { select: { poNumber: true } },
      invoice: { select: { invoiceNumber: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!payment) notFound();

  const amount = toNum(payment.amount);
  const tdsAmount = toNum(payment.tdsAmount);
  const netPaid = toNum(payment.netPaidAmount);
  const words = amountInWords(netPaid);

  return (<>
          <PrintToolbar title="Payment Voucher" />
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Payment Voucher"
        docNumber={payment.paymentNumber}
        date={payment.paymentDate}
      />

      {/* Payee info */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Payee</div>
          <div className="font-semibold">{payment.supplier.name}</div>
          {payment.supplier.gstin && <div className="text-xs text-gray-500">GSTIN: {payment.supplier.gstin}</div>}
          {payment.supplier.phone && <div className="text-xs text-gray-500">Ph: {payment.supplier.phone}</div>}
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">References</div>
          {payment.purchaseOrder && (
            <div className="text-xs text-gray-500">PO: <span className="font-mono">{payment.purchaseOrder.poNumber}</span></div>
          )}
          {payment.invoice && (
            <div className="text-xs text-gray-500">Invoice: <span className="font-mono">{payment.invoice.invoiceNumber}</span></div>
          )}
          {payment.createdBy && (
            <div className="text-xs text-gray-500">Prepared by: {payment.createdBy.name}</div>
          )}
        </div>
      </div>

      {/* Payment details */}
      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">Payment Mode</td>
            <td className="px-2 py-1.5">{payment.paymentMode}</td>
          </tr>
          {payment.referenceNo && (
            <tr className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">Reference No.</td>
              <td className="px-2 py-1.5 font-mono">{payment.referenceNo}</td>
            </tr>
          )}
          {payment.purchaseOrder && (
            <tr className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">PO Number</td>
              <td className="px-2 py-1.5 font-mono">{payment.purchaseOrder.poNumber}</td>
            </tr>
          )}
          {payment.invoice && (
            <tr className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">Invoice Number</td>
              <td className="px-2 py-1.5 font-mono">{payment.invoice.invoiceNumber}</td>
            </tr>
          )}
          <tr className="border-b border-gray-200">
            <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">Gross Amount</td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(amount)}</td>
          </tr>
          {tdsAmount > 0 && (
            <>
              <tr className="border-b border-gray-200">
                <td className="border-r border-gray-300 px-2 py-1.5 font-semibold">TDS Deducted {payment.tdsSection ? `(${payment.tdsSection})` : ""}</td>
                <td className="px-2 py-1.5 text-right tnum">− {formatCurrency(tdsAmount)}</td>
              </tr>
            </>
          )}
          <tr className="border-t-2 border-black">
            <td className="border-r border-gray-300 px-2 py-2 font-bold">Net Paid</td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(netPaid)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Net Paid In Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Notes */}
      {payment.notes && (
        <div className="mt-3 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{payment.notes}</span>
        </div>
      )}

      {/* Prepared by */}
      {payment.createdBy && (
        <div className="mt-3 text-sm">
          <span className="font-semibold">Prepared by: </span>
          <span>{payment.createdBy.name}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">Prepared By</div>
        <div className="border-t border-black pt-1">Approved By</div>
        <div className="border-t border-black pt-1">Accounts Officer</div>
      </div>

    </div>
    </>
  );
}
