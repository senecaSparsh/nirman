import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Material Sale Invoice — for selling raw materials to customers.
 * Shows customer info, line items with GST, totals, amount in words, signatures.
 * Opened in a new tab from the Material Sales page.
 */
export default async function MaterialSaleInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const sale = await prisma.materialSale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { name: true, phone: true, address: true, gstin: true } },
      project: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true, hsnCode: true } },
          location: { select: { name: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!sale) notFound();

  const subtotal = toNum(sale.subtotal);
  const gstTotal = toNum(sale.gstTotal);
  const total = toNum(sale.totalAmount);
  const words = amountInWords(total);

  return (
    <div className="print-page mx-auto max-w-3xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-700">Material Sale Invoice</h2>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">{sale.saleNumber}</div>
          <div className="text-gray-600">{formatDate(sale.saleDate)}</div>
        </div>
      </div>

      {/* Company + Customer info */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold">{company.name}</div>
          {company.address && <div className="text-gray-600">{company.address}</div>}
          {company.gstin && <div className="text-gray-600">GSTIN: {company.gstin}</div>}
        </div>
        <div className="border-l border-gray-300 pl-4">
          <div className="font-semibold">Bill To: {sale.customer.name}</div>
          {sale.customer.address && <div className="text-gray-600">{sale.customer.address}</div>}
          {sale.customer.phone && <div className="text-gray-600">Ph: {sale.customer.phone}</div>}
          {sale.customer.gstin && <div className="text-gray-600">GSTIN: {sale.customer.gstin}</div>}
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">HSN</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Per</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">GST</th>
            <th className="px-2 py-1.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line, i) => {
            const lineBase = toNum(line.qty) * toNum(line.unitPrice);
            const lineGst = toNum(line.gstAmount);
            return (
              <tr key={line.id} className="border-b border-gray-200">
                <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border-r border-gray-300 px-2 py-1.5">
                  {line.material.name}
                  <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                  {line.material.hsnCode ?? "—"}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                  {formatNumber(toNum(line.qty))}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                  {line.material.unit}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                  {formatCurrency(toNum(line.unitPrice))}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                  {lineGst > 0 ? formatCurrency(lineGst) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(lineBase + lineGst)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300">
            <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">Subtotal:</td>
            <td colSpan={2} className="px-2 py-1.5 text-right font-semibold tnum">{formatCurrency(subtotal)}</td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(subtotal)}</td>
          </tr>
          {gstTotal > 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">GST Total:</td>
              <td colSpan={2} className="px-2 py-1.5 text-right font-semibold tnum">{formatCurrency(gstTotal)}</td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstTotal)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-black">
            <td colSpan={7} className="px-2 py-2 text-right font-bold">Grand Total:</td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Amount in Words: </span>
        <span className="italic">{words}</span>
      </div>

      {sale.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{sale.notes}</span>
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="mt-4 border-t border-gray-300 pt-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">Terms &amp; Conditions:</div>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>Payment is due as per the agreed terms.</li>
          <li>Goods once sold are not returnable unless defective.</li>
          <li>Prices are inclusive of applicable GST.</li>
          <li>This is a computer-generated invoice.</li>
        </ol>
      </div>

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-2 gap-12 text-center text-sm">
        <div className="border-t border-black pt-1">Customer Signature</div>
        <div className="border-t border-black pt-1">For {company.name}</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Invoice" />
      </div>
    </div>
  );
}
