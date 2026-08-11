import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Purchase Order document — matches the client's paper layout.
 * Shows the PO with supplier info, line items, totals, GST breakdown,
 * amount in words, terms, and signature blocks.
 * Opened in a new tab from the Procurement page or PO detail dialog.
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { name: true, phone: true, gstin: true, address: true } },
      project: { select: { name: true } },
      destinationLocation: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true, hsnCode: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });

  if (!po) notFound();

  const subtotal = toNum(po.subtotal);
  const gstTotal = toNum(po.gstTotal);
  const total = toNum(po.total);
  const words = amountInWords(total);

  return (
    <div className="print-page mx-auto max-w-3xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Purchase Order</h1>
          <p className="text-sm text-gray-600">{po.status}</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">{po.poNumber}</div>
          <div className="text-gray-600">{formatDate(po.orderDate)}</div>
          {po.expectedDate && (
            <div className="text-gray-600">Expected: {formatDate(po.expectedDate)}</div>
          )}
        </div>
      </div>

      {/* Company + Supplier info */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold">{company.name}</div>
          {company.address && <div className="text-gray-600">{company.address}</div>}
          {company.gstin && <div className="text-gray-600">GSTIN: {company.gstin}</div>}
        </div>
        <div className="border-l border-gray-300 pl-4">
          <div className="font-semibold">To: {po.supplier.name}</div>
          {po.supplier.address && <div className="text-gray-600">{po.supplier.address}</div>}
          {po.supplier.phone && <div className="text-gray-600">Ph: {po.supplier.phone}</div>}
          {po.supplier.gstin && <div className="text-gray-600">GSTIN: {po.supplier.gstin}</div>}
        </div>
      </div>

      {/* Delivery info */}
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-semibold">Deliver To: </span>
          <span>{po.destinationLocation.name}</span>
        </div>
        <div>
          <span className="font-semibold">Scope: </span>
          <span>{po.procurementScope === "PROJECT" ? "Project Site" : "Company Warehouse"}</span>
          {po.project && <span className="text-gray-600"> · {po.project.name}</span>}
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">
              Description of Goods
            </th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">HSN</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Per</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((line, i) => {
            const lineTotal = toNum(line.qtyOrdered) * toNum(line.unitCost);
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
                  {toNum(line.qtyOrdered)}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                  {line.material.unit}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                  {formatCurrency(toNum(line.unitCost))}
                </td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300">
            <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">
              Subtotal:
            </td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(subtotal)}</td>
          </tr>
          {gstTotal > 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">
                GST Total:
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstTotal)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-black">
            <td colSpan={6} className="px-2 py-2 text-right font-bold">
              Grand Total:
            </td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Amount in Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Terms & Conditions */}
      <div className="mt-4 border-t border-gray-300 pt-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">Terms &amp; Conditions:</div>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>Payment terms: As agreed upon between parties.</li>
          <li>Goods must be delivered as per the expected date mentioned above.</li>
          <li>Quality must match the specifications and samples approved.</li>
          <li>Any discrepancy must be reported within 7 days of receipt.</li>
        </ol>
      </div>

      {po.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{po.notes}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">
          <div className="text-gray-600">Raised by</div>
          <div className="mt-1 font-medium">{po.createdBy?.name ?? "—"}</div>
        </div>
        <div className="border-t border-black pt-1">
          <div className="text-gray-600">Approved by</div>
          <div className="mt-1 font-medium">{po.approvedBy?.name ?? "—"}</div>
        </div>
        <div className="border-t border-black pt-1">For Supplier</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Purchase Order" />
      </div>
    </div>
  );
}
