import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {formatCurrency, formatNumber} from "@/lib/utils";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Print-friendly Measurement Book entry — shows the measured quantity
 * for a BOQ line item with rate and amount, along with approval workflow
 * signatures.
 */
export default async function MeasurementBookPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.MB_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const entry = await prisma.measurementBookEntry.findFirst({
    where: {
      id,
      project: { companyId: company.id },
    },
    include: {
      project: { select: { name: true } },
      phase: { select: { name: true } },
      boqItem: { select: { serialNo: true, description: true, unit: true, rate: true } },
      wbsNode: { select: { code: true, name: true } },
      measuredBy: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });

  if (!entry) notFound();

  const rate = toNum(entry.boqItem.rate);
  const measuredQty = toNum(entry.measuredQty);
  const cumulativeQty = toNum(entry.cumulativeQty);
  const amount = rate * measuredQty;
  const cumulativeAmount = rate * cumulativeQty;

  return (
    <>
      <PrintToolbar title="Measurement Book Entry" />
      <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
        <PrintHeader
          company={company}
          title="Measurement Book"
          docNumber={entry.mbNumber}
          date={entry.measureDate}
        />

        {/* Entry details */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Project</div>
            <div className="font-semibold">{entry.project.name}</div>
            {entry.phase && (
              <div className="text-xs text-gray-500">Phase: {entry.phase.name}</div>
            )}
            {entry.wbsNode && (
              <div className="text-xs text-gray-500">
                WBS: {entry.wbsNode.code} — {entry.wbsNode.name}
              </div>
            )}
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">BOQ Item</div>
            <div className="font-semibold">{entry.boqItem.serialNo}</div>
            <div className="text-xs text-gray-500">{entry.boqItem.description}</div>
          </div>
        </div>

        {/* Work description + location */}
        {(entry.locationRef || entry.description) && (
          <div className="mt-3 rounded-md border border-gray-300 p-2.5 text-sm">
            {entry.description && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Description of Work: </span>
                <span>{entry.description}</span>
              </div>
            )}
            {entry.locationRef && (
              <div className="mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Location: </span>
                <span>{entry.locationRef}</span>
              </div>
            )}
          </div>
        )}

        {/* Measurement table */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-center font-semibold">Unit</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
              <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5">
                {entry.boqItem.description}
                <span className="ml-1 text-xs text-gray-500">({entry.boqItem.serialNo})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                {entry.boqItem.unit ?? "—"}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatNumber(measuredQty, 3)}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatCurrency(rate)}
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td colSpan={2} className="px-2 py-1.5 text-right font-semibold">This Entry:</td>
              <td className="px-2 py-1.5 text-right tnum font-semibold">{formatNumber(measuredQty, 3)}</td>
              <td className="px-2 py-1.5 text-right tnum font-semibold">{formatCurrency(rate)}</td>
              <td className="px-2 py-1.5 text-right tnum font-bold">{formatCurrency(amount)}</td>
            </tr>
            <tr className="border-t-2 border-black">
              <td colSpan={2} className="px-2 py-2 text-right font-bold">Cumulative:</td>
              <td className="px-2 py-2 text-right tnum font-bold">{formatNumber(cumulativeQty, 3)}</td>
              <td className="px-2 py-2 text-right tnum font-bold">{formatCurrency(rate)}</td>
              <td className="px-2 py-2 text-right tnum font-bold">{formatCurrency(cumulativeAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Status + approval info */}
        <div className="mt-3 text-sm">
          <span className="font-semibold">Status: </span>
          <span>{entry.status}</span>
          {entry.rejectReason && (
            <div className="mt-1 text-xs text-red-700">
              <span className="font-semibold">Rejection Reason: </span>
              <span>{entry.rejectReason}</span>
            </div>
          )}
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Measured By</div>
            <div className="mt-0.5 font-medium">{entry.measuredBy?.name ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Verified By</div>
            <div className="mt-0.5 font-medium">{entry.verifiedBy?.name ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Approved By</div>
            <div className="mt-0.5 font-medium">{entry.approvedBy?.name ?? "—"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
