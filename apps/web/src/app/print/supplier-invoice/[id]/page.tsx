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
 * Print-friendly Supplier Invoice / Bill — shows the supplier's invoice
 * with three-way match status, line items, GST breakdown, and payment terms.
 * Used by the finance team for records and audit trail.
 */
export default async function SupplierInvoicePrintPage({
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

  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { name: true, phone: true, address: true, gstin: true } },
      purchaseOrder: { select: { poNumber: true } },
      receivedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      payments: { select: { id: true, amount: true, paymentDate: true, paymentNumber: true } },
    },
  });

  if (!invoice) notFound();

  const subtotal = toNum(invoice.subtotal);
  const gstAmount = toNum(invoice.gstAmount);
  const totalAmount = toNum(invoice.totalAmount);
  const words = amountInWords(totalAmount);
  const totalPaid = invoice.payments.reduce((s, p) => s + toNum(p.amount), 0);
  const balanceDue = totalAmount - totalPaid;

  return (<>
          <PrintToolbar title="Supplier Invoice" />
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Supplier Invoice / Bill"
        docNumber={invoice.invoiceNumber}
        date={invoice.invoiceDate}
        extra={invoice.dueDate ? <div className="text-xs text-gray-500">Due: {formatDate(invoice.dueDate)}</div> : undefined}
      />

      {/* Supplier info */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Supplier</div>
          <div className="font-semibold">{invoice.supplier.name}</div>
          {invoice.supplier.gstin && <div className="text-xs text-gray-500">GSTIN: {invoice.supplier.gstin}</div>}
          {invoice.supplier.phone && <div className="text-xs text-gray-500">Ph: {invoice.supplier.phone}</div>}
          {invoice.supplier.address && <div className="text-xs text-gray-500">{invoice.supplier.address}</div>}
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Linked PO</div>
          <div className="font-mono font-semibold">{invoice.purchaseOrder?.poNumber ?? "—"}</div>
          {invoice.receivedBy && (
            <div className="text-xs text-gray-500">Received by: {invoice.receivedBy.name}</div>
          )}
          {invoice.approvedBy && (
            <div className="text-xs text-gray-500">Approved by: {invoice.approvedBy.name}</div>
          )}
        </div>
      </div>

      {/* Three-way match status */}
      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="font-semibold">Match:</span>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${
          invoice.matchStatus === "THREE_WAY_MATCH" ? "bg-green-100 text-green-800" :
          invoice.matchStatus === "TWO_WAY_MATCH" ? "bg-blue-100 text-blue-800" :
          invoice.matchStatus === "UNMATCHED" ? "bg-amber-100 text-amber-800" :
          "bg-gray-100 text-gray-700"
        }`}>
          {(invoice.matchStatus ?? "NOT CHECKED").replace(/_/g, " ")}
        </span>
        <span className="font-semibold ml-auto">Status:</span>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${
          invoice.status === "PAID" ? "bg-green-100 text-green-800" :
          invoice.status === "APPROVED" ? "bg-blue-100 text-blue-800" :
          invoice.status === "DISPUTED" ? "bg-red-100 text-red-800" :
          "bg-gray-100 text-gray-700"
        }`}>
          {invoice.status}
        </span>
      </div>
      {invoice.matchNotes && invoice.matchStatus !== "THREE_WAY_MATCH" && (
        <div className="mt-1 text-xs text-amber-700">
          {invoice.matchNotes.split(";").filter(n => n.trim()).length} line(s) with variance — review before payment
        </div>
      )}

      {/* Totals summary */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="border-r border-gray-300 px-2 py-1.5">Subtotal (Taxable Value)</td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(subtotal)}</td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="border-r border-gray-300 px-2 py-1.5">GST</td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstAmount)}</td>
          </tr>
          <tr className="border-t-2 border-black">
            <td className="border-r border-gray-300 px-2 py-2 font-bold">Total Invoice Amount</td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(totalAmount)}</td>
          </tr>
          {totalPaid > 0 && (
            <>
              <tr className="border-b border-gray-200">
                <td className="border-r border-gray-300 px-2 py-1.5">Total Paid</td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(totalPaid)}</td>
              </tr>
              <tr className="border-t border-gray-400">
                <td className="border-r border-gray-300 px-2 py-2 font-bold">Balance Due</td>
                <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(balanceDue)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">In Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Payment history */}
      {invoice.payments.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold border-b border-gray-300 pb-1">Payment History</h3>
          <table className="w-full text-xs mt-1">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1">Payment No.</th>
                <th className="text-left py-1">Date</th>
                <th className="text-right py-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-1 font-mono">{p.paymentNumber}</td>
                  <td className="py-1">{formatDate(p.paymentDate)}</td>
                  <td className="py-1 text-right tnum">{formatCurrency(toNum(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval signatures */}
      <div className="mt-4 text-sm">
        {invoice.approvedBy && (
          <div>Approved by: {invoice.approvedBy.name} on {invoice.approvedAt ? formatDate(invoice.approvedAt) : "—"}</div>
        )}
        {invoice.receivedBy && (
          <div>Received by: {invoice.receivedBy.name}</div>
        )}
      </div>

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">Prepared By</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

    </div>
    </>
  );
}
