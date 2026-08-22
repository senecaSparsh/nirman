import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany, getCompanyGroupIds } from "@/lib/server";
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
  const groupCompanyIds = await getCompanyGroupIds(company);

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: { in: groupCompanyIds } },
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
      charges: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });

  if (!po) notFound();

  const subtotal = toNum(po.subtotal);
  const gstTotal = toNum(po.gstTotal);
  const total = toNum(po.total);
  const freightTotal = toNum(po.freightTotal);
  const loadingTotal = toNum(po.loadingTotal);
  const packingTotal = toNum(po.packingTotal);
  const insuranceTotal = toNum(po.insuranceTotal);
  const discountTotal = toNum(po.discountTotal);
  const miscChargesTotal = toNum(po.miscChargesTotal);
  const charges = po.charges;
  const words = amountInWords(total);

  return (<>
          <PrintToolbar title="Purchase Order" />
    <div className="print-page mx-auto max-w-3xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Purchase Order"
        docNumber={po.poNumber}
        date={po.orderDate}
        extra={po.expectedDate ? <div className="text-xs text-gray-500">Expected: {formatDate(po.expectedDate)}</div> : undefined}
      />

      {/* Supplier info */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Deliver To</div>
          <div className="font-semibold">{po.destinationLocation.name}</div>
          <div className="text-xs text-gray-500">
            {po.procurementScope === "PROJECT" ? "Project Site" : "Company Warehouse"}
            {po.project && ` · ${po.project.name}`}
          </div>
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Supplier</div>
          <div className="font-semibold">{po.supplier.name}</div>
          {po.supplier.address && <div className="text-xs text-gray-500">{po.supplier.address}</div>}
          <div className="text-xs text-gray-500">
            {po.supplier.gstin && <span className="mr-2">GSTIN: {po.supplier.gstin}</span>}
            {po.supplier.phone && <span>Ph: {po.supplier.phone}</span>}
          </div>
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
          {/* Itemized charges */}
          {charges.map((c) => (
            <tr key={c.id}>
              <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">
                {c.heading}{c.notes ? ` (${c.notes})` : ""}:
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(toNum(c.amount))}</td>
            </tr>
          ))}
          {/* Auto-computed header charges not itemized */}
          {freightTotal > 0 && !charges.some((c) => c.heading.includes("Freight")) ? (
            <tr><td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Freight / Transportation:</td><td className="px-2 py-1.5 text-right tnum">{formatCurrency(freightTotal)}</td></tr>
          ) : null}
          {loadingTotal > 0 && !charges.some((c) => c.heading.includes("Loading")) ? (
            <tr><td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Loading / Unloading:</td><td className="px-2 py-1.5 text-right tnum">{formatCurrency(loadingTotal)}</td></tr>
          ) : null}
          {packingTotal > 0 && !charges.some((c) => c.heading.includes("Packing")) ? (
            <tr><td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Packing & Forwarding:</td><td className="px-2 py-1.5 text-right tnum">{formatCurrency(packingTotal)}</td></tr>
          ) : null}
          {insuranceTotal > 0 && !charges.some((c) => c.heading.includes("Insurance")) ? (
            <tr><td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Transit Insurance:</td><td className="px-2 py-1.5 text-right tnum">{formatCurrency(insuranceTotal)}</td></tr>
          ) : null}
          {discountTotal > 0 ? (
            <tr><td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Discount:</td><td className="px-2 py-1.5 text-right tnum">−{formatCurrency(discountTotal)}</td></tr>
          ) : null}
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

    </div>
    </>
  );
}
