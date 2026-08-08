import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Stock Transfer Note — for moving stock between locations.
 * Shows from/to locations, materials, quantities, and signatures.
 * Opened in a new tab from the Procurement → Transfers tab.
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
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      createdBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!transfer) notFound();

  const totalQty = transfer.lines.reduce((s, l) => s + toNum(l.qty), 0);

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-700">Stock Transfer Note</h2>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">STN-{transfer.id.slice(-8).toUpperCase()}</div>
          <div className="text-gray-600">{formatDate(transfer.transferDate)}</div>
          <div className="mt-1 font-semibold">{transfer.status}</div>
        </div>
      </div>

      {/* Route info */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-md border border-gray-300 p-2">
          <div className="text-xs font-semibold uppercase text-gray-500">From</div>
          <div className="font-medium">{transfer.fromLocation.name}</div>
        </div>
        <div className="rounded-md border border-gray-300 p-2">
          <div className="text-xs font-semibold uppercase text-gray-500">To</div>
          <div className="font-medium">{transfer.toLocation.name}</div>
        </div>
        <div>
          <span className="font-semibold">Inter-Company: </span>
          <span>{transfer.isInterCompany ? "Yes" : "No"}</span>
        </div>
        <div>
          <span className="font-semibold">Created By: </span>
          <span>{transfer.createdBy?.name ?? "—"}</span>
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Material</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="px-2 py-1.5 text-left font-semibold">Unit</th>
          </tr>
        </thead>
        <tbody>
          {transfer.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.material.name}
                <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatNumber(toNum(line.qty))}
              </td>
              <td className="px-2 py-1.5 text-gray-600">{line.material.unit}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black">
            <td colSpan={2} className="px-2 py-1.5 text-right font-bold">Total:</td>
            <td className="px-2 py-1.5 text-right font-bold tnum">{formatNumber(totalQty)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {transfer.notes && (
        <div className="mt-3 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{transfer.notes}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">Issued By</div>
        <div className="border-t border-black pt-1">Received By</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Transfer Note" />
      </div>
    </div>
  );
}
