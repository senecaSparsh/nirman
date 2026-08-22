import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Stock Transfer Note — for moving stock between locations.
 * Shows from/to locations with addresses, materials with value, transport
 * details, and dispatch/receive signatures.
 */
export default async function StockTransferNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id,
      OR: [
        { fromLocation: { companyId: company.id } },
        { toLocation: { companyId: company.id } },
      ],
    },
    include: {
      fromLocation: { select: { name: true, address: true, type: true } },
      toLocation: { select: { name: true, address: true, type: true } },
      createdBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true, hsnCode: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!transfer) notFound();

  const totalQty = transfer.lines.reduce((s, l) => s + toNum(l.qty), 0);
  const totalValue = transfer.lines.reduce(
    (s, l) => s + toNum(l.qty) * toNum(l.unitCostAtSource ?? 0),
    0,
  );

  return (
    <>
      <PrintToolbar title="Stock Transfer Note" />
      <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
        <PrintHeader
          company={company}
          title="Stock Transfer Note"
          docNumber={`STN-${transfer.id.slice(-8).toUpperCase()}`}
          date={transfer.transferDate}
          extra={<div className="text-xs font-semibold uppercase text-gray-600">{transfer.status}</div>}
        />

        {/* From → To */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">From</div>
            <div className="font-semibold">{transfer.fromLocation.name}</div>
            <div className="text-xs text-gray-500">{transfer.fromLocation.type}</div>
            {transfer.fromLocation.address && (
              <div className="mt-0.5 text-xs text-gray-500">{transfer.fromLocation.address}</div>
            )}
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">To</div>
            <div className="font-semibold">{transfer.toLocation.name}</div>
            <div className="text-xs text-gray-500">{transfer.toLocation.type}</div>
            {transfer.toLocation.address && (
              <div className="mt-0.5 text-xs text-gray-500">{transfer.toLocation.address}</div>
            )}
          </div>
        </div>

        {/* Transport details */}
        {(transfer.vehicleNumber || transfer.challanNumber || transfer.deliveryMode || transfer.transporterName) && (
          <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
              {transfer.deliveryMode && (
                <div><span className="text-gray-500">Mode:</span> <span className="font-medium">{transfer.deliveryMode.replace(/_/g, " ")}</span></div>
              )}
              {transfer.vehicleNumber && (
                <div><span className="text-gray-500">Vehicle:</span> <span className="font-mono font-medium">{transfer.vehicleNumber}</span></div>
              )}
              {transfer.vehicleType && (
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">{transfer.vehicleType}</span></div>
              )}
              {transfer.driverName && (
                <div><span className="text-gray-500">Driver:</span> <span className="font-medium">{transfer.driverName}</span></div>
              )}
              {transfer.challanNumber && (
                <div><span className="text-gray-500">Challan:</span> <span className="font-mono font-medium">{transfer.challanNumber}</span></div>
              )}
              {transfer.transporterName && (
                <div><span className="text-gray-500">Transporter:</span> <span className="font-medium">{transfer.transporterName}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Inter-company */}
        {transfer.isInterCompany && (
          <div className="mt-2 text-xs">
            <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              Inter-Company Transfer
            </span>
            {toNum(transfer.markupPct) > 0 && (
              <span className="ml-2 text-gray-600">Markup: {toNum(transfer.markupPct)}%</span>
            )}
          </div>
        )}

        {/* Line items */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Material</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-center font-semibold">Unit</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
              <th className="px-2 py-1.5 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((line, i) => {
              const rate = toNum(line.unitCostAtSource ?? 0);
              const value = toNum(line.qty) * rate;
              return (
                <tr key={line.id} className="border-b border-gray-200">
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border-r border-gray-300 px-2 py-1.5">
                    {line.material.name}
                    <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                    {formatNumber(toNum(line.qty))}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                    {line.material.unit}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                    {rate > 0 ? formatCurrency(rate) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">
                    {value > 0 ? formatCurrency(value) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={2} className="px-2 py-1.5 text-right font-bold">Total:</td>
              <td className="px-2 py-1.5 text-right font-bold tnum">{formatNumber(totalQty)}</td>
              <td colSpan={2} className="px-2 py-1.5 text-right font-semibold text-gray-600">Total Value:</td>
              <td className="px-2 py-1.5 text-right font-bold tnum">{formatCurrency(totalValue)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Shortage / damage */}
        {(transfer.shortageRemarks || transfer.damageRemarks) && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm">
            {transfer.shortageRemarks && (
              <div><span className="font-semibold text-red-700">Shortage: </span><span>{transfer.shortageRemarks}</span></div>
            )}
            {transfer.damageRemarks && (
              <div><span className="font-semibold text-red-700">Damage: </span><span>{transfer.damageRemarks}</span></div>
            )}
          </div>
        )}

        {transfer.notes && (
          <div className="mt-3 text-sm">
            <span className="font-semibold">Notes: </span>
            <span>{transfer.notes}</span>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Issued By</div>
            <div className="mt-0.5 font-medium">{transfer.dispatchedBy?.name ?? transfer.createdBy?.name ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Received By</div>
            <div className="mt-0.5 font-medium">{transfer.receivedBy?.name ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">Authorised Signatory</div>
        </div>
      </div>
    </>
  );
}
