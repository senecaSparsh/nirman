import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Delivery Challan — matches the client's paper layout.
 * Shows the goods receipt with particulars, quantity, rate, amount,
 * gross/net totals, amount in words, and terms & conditions.
 * Opened in a new tab from the Goods Receipts or Procurement page.
 */
export default async function GoodsReceiptChallanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  // Gate access — challans show material costs and supplier info.
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id,
      location: { companyId: company.id },
    },
    include: {
      purchaseOrder: {
        select: {
          poNumber: true,
          supplier: { select: { name: true, phone: true, address: true } },
        },
      },
      location: { select: { name: true } },
      receivedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!receipt) notFound();

  const grossTotal = receipt.lines.reduce(
    (s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost),
    0,
  );
  const words = amountInWords(grossTotal);
  const supplier = receipt.purchaseOrder?.supplier;

  return (
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Delivery Challan</h1>
          <p className="text-sm text-gray-600">Original Copy</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">GRN: {receipt.id.slice(-8).toUpperCase()}</div>
          <div className="text-gray-600">{formatDate(receipt.receiptDate)}</div>
        </div>
      </div>

      {/* Company + Supplier info */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold">{company.name}</div>
          {company.address && <div className="text-gray-600">{company.address}</div>}
          {company.phone && <div className="text-gray-600">Ph: {company.phone}</div>}
          {company.email && <div className="text-gray-600">{company.email}</div>}
          {company.gstin && <div className="text-gray-600">GSTIN: {company.gstin}</div>}
        </div>
        <div>
          <span className="font-semibold">Supplier: </span>
          <span>{supplier?.name ?? "—"}</span>
          {supplier?.phone && <div className="text-gray-600">Ph: {supplier.phone}</div>}
        </div>
        <div>
          <span className="font-semibold">PO Number: </span>
          <span className="font-mono">{receipt.purchaseOrder?.poNumber ?? "Direct"}</span>
        </div>
        <div>
          <span className="font-semibold">Received At: </span>
          <span>{receipt.location.name}</span>
        </div>
        <div>
          <span className="font-semibold">Gate Entry No.: </span>
          <span className="font-mono">{receipt.id.slice(-6).toUpperCase()}</span>
        </div>
        <div>
          <span className="font-semibold">Received By: </span>
          <span>{receipt.receivedBy?.name ?? "—"}</span>
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">
              Particulars
            </th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Per</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.material.name}
                <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {toNum(line.qtyReceived)}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatCurrency(toNum(line.unitCost))}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                {line.material.unit}
              </td>
              <td className="px-2 py-1.5 text-right tnum">
                {formatCurrency(toNum(line.qtyReceived) * toNum(line.unitCost))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black">
            <td colSpan={5} className="px-2 py-2 text-right font-bold">
              Gross Total:
            </td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(grossTotal)}</td>
          </tr>
          <tr>
            <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">
              Net Total:
            </td>
            <td className="px-2 py-1.5 text-right font-bold tnum">{formatCurrency(grossTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">In Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Inspection status */}
      {receipt.inspectionStatus !== "PENDING" && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Inspection: </span>
          <span>{receipt.inspectionStatus}</span>
          {receipt.inspectionNotes && <span> — {receipt.inspectionNotes}</span>}
        </div>
      )}

      {receipt.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{receipt.notes}</span>
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="mt-4 border-t border-gray-300 pt-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">Terms &amp; Conditions:</div>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>Payment Must Be Made Within 7 Days.</li>
          <li>No Guarantee of Goods in Transit.</li>
        </ol>
      </div>

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">For Supplier</div>
        <div className="border-t border-black pt-1">For Store</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Challan" />
      </div>
    </div>
  );
}
