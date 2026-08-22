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
  const groupCompanyIds = await getCompanyGroupIds(company);

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id,
      location: { companyId: { in: groupCompanyIds } },
    },
    include: {
      purchaseOrder: {
        select: {
          poNumber: true,
          supplier: { select: { name: true, phone: true, address: true, gstin: true } },
          lines: { select: { materialId: true, gstRate: true } },
        },
      },
      location: { select: { name: true } },
      receivedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true, hsnCode: true } },
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
  // Compute GST per line from PO line gstRate
  const gstTotal = receipt.lines.reduce((s, l) => {
    const poLine = receipt.purchaseOrder?.lines.find((pl) => pl.materialId === l.materialId);
    const rate = toNum(poLine?.gstRate ?? 0);
    return s + toNum(l.qtyReceived) * toNum(l.unitCost) * (rate / 100);
  }, 0);
  const grandTotal = grossTotal + gstTotal;
  const words = amountInWords(grandTotal);
  const supplier = receipt.purchaseOrder?.supplier;

  return (<>
          <PrintToolbar title="Delivery Challan" />
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title="Delivery Challan"
        docNumber={`GRN-${receipt.id.slice(-8).toUpperCase()}`}
        date={receipt.receiptDate}
      />

      {/* Supplier + receipt info */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Supplier</div>
          <div className="font-semibold">{supplier?.name ?? "—"}</div>
          {supplier?.gstin && <div className="text-xs text-gray-500">GSTIN: {supplier.gstin}</div>}
          {supplier?.phone && <div className="text-xs text-gray-500">Ph: {supplier.phone}</div>}
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Received At</div>
          <div className="font-semibold">{receipt.location.name}</div>
          <div className="text-xs text-gray-500">PO: {receipt.purchaseOrder?.poNumber ?? "Direct"}</div>
          <div className="text-xs text-gray-500">By: {receipt.receivedBy?.name ?? "—"}</div>
        </div>
        <div>
          <span className="font-semibold">Gate Pass No.: </span>
          <span className="font-mono">{receipt.gatePassNo ?? (receipt.receivingPhotoUrl ? "Receiving photo" : "—")}</span>
        </div>
        {receipt.unloadingSlipNo && (
          <div>
            <span className="font-semibold">Unloading Slip No.: </span>
            <span className="font-mono">{receipt.unloadingSlipNo}</span>
          </div>
        )}
        <div>
          <span className="font-semibold">Received By: </span>
          <span>{receipt.receivedBy?.name ?? "—"}</span>
        </div>
      </div>

      {/* Transport / delivery details */}
      {(receipt.vehicleNumber || receipt.challanNumber || receipt.deliveryMode || receipt.lrNumber) && (
        <div className="mt-3 rounded border border-gray-300 p-2 text-sm">
          <div className="font-semibold border-b border-gray-200 pb-1 mb-1">Transport Details</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {receipt.deliveryMode && (
              <div><span className="text-gray-600">Delivery Mode:</span> <span className="font-medium">{receipt.deliveryMode.replace(/_/g, " ")}</span></div>
            )}
            {receipt.vehicleNumber && (
              <div><span className="text-gray-600">Vehicle No:</span> <span className="font-mono font-medium">{receipt.vehicleNumber}</span></div>
            )}
            {receipt.vehicleType && (
              <div><span className="text-gray-600">Vehicle Type:</span> <span className="font-medium">{receipt.vehicleType}</span></div>
            )}
            {receipt.driverName && (
              <div><span className="text-gray-600">Driver:</span> <span className="font-medium">{receipt.driverName}</span></div>
            )}
            {receipt.challanNumber && (
              <div><span className="text-gray-600">Challan No:</span> <span className="font-mono font-medium">{receipt.challanNumber}</span></div>
            )}
            {receipt.invoiceNumber && (
              <div><span className="text-gray-600">Invoice No:</span> <span className="font-mono font-medium">{receipt.invoiceNumber}</span></div>
            )}
            {receipt.ewayBillNumber && (
              <div><span className="text-gray-600">E-Way Bill:</span> <span className="font-mono font-medium">{receipt.ewayBillNumber}</span></div>
            )}
            {receipt.lrNumber && (
              <div><span className="text-gray-600">LR No:</span> <span className="font-mono font-medium">{receipt.lrNumber}</span></div>
            )}
            {receipt.transporterName && (
              <div><span className="text-gray-600">Transporter:</span> <span className="font-medium">{receipt.transporterName}</span></div>
            )}
            {receipt.packageCount != null && (
              <div><span className="text-gray-600">Packages:</span> <span className="font-medium">{receipt.packageCount}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Weighbridge data (for bulk materials) */}
      {receipt.netWeight != null && (
        <div className="mt-2 rounded border border-gray-300 p-2 text-sm">
          <div className="font-semibold border-b border-gray-200 pb-1 mb-1">Weighbridge</div>
          <div className="grid grid-cols-3 gap-2">
            {receipt.grossWeight != null && (
              <div><span className="text-gray-600">Gross:</span> <span className="font-mono font-medium">{toNum(receipt.grossWeight)} kg</span></div>
            )}
            {receipt.tareWeight != null && (
              <div><span className="text-gray-600">Tare:</span> <span className="font-mono font-medium">{toNum(receipt.tareWeight)} kg</span></div>
            )}
            <div><span className="text-gray-600">Net:</span> <span className="font-mono font-bold">{toNum(receipt.netWeight)} kg</span></div>
          </div>
          {receipt.weighbridgeTicketNo && (
            <div className="mt-1"><span className="text-gray-600">Ticket No:</span> <span className="font-mono">{receipt.weighbridgeTicketNo}</span></div>
          )}
        </div>
      )}

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">
              Particulars
            </th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">HSN</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Per</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => {
            const poLine = receipt.purchaseOrder?.lines.find((pl) => pl.materialId === line.materialId);
            const lineAmount = toNum(line.qtyReceived) * toNum(line.unitCost);
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
                  {toNum(line.qtyReceived)}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                  {formatCurrency(toNum(line.unitCost))}
                </td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                  {line.material.unit}
                </td>
                <td className="px-2 py-1.5 text-right tnum">
                  {formatCurrency(lineAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300">
            <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">
              Taxable Value:
            </td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(grossTotal)}</td>
          </tr>
          {gstTotal > 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">
                GST:
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstTotal)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-black">
            <td colSpan={6} className="px-2 py-2 text-right font-bold">
              Grand Total:
            </td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">In Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Shortage / damage remarks */}
      {(receipt.shortageRemarks || receipt.damageRemarks) && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm">
          {receipt.shortageRemarks && (
            <div><span className="font-semibold text-red-700">Shortage: </span><span>{receipt.shortageRemarks}</span></div>
          )}
          {receipt.damageRemarks && (
            <div><span className="font-semibold text-red-700">Damage: </span><span>{receipt.damageRemarks}</span></div>
          )}
        </div>
      )}

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
          <li>Goods received subject to quality inspection and verification.</li>
          <li>Any shortage or damage must be reported within 7 days.</li>
          <li>This is a computer-generated delivery challan — signature of receiver confirms receipt.</li>
        </ol>
      </div>

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">For Supplier</div>
        <div className="border-t border-black pt-1">For Store</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

    </div>
    </>
  );
}
