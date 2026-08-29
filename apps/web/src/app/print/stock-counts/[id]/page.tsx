import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Print-friendly Stock Count / Inventory Reconciliation sheet —
 * shows counted vs system quantities with variance for a location.
 */
export default async function StockCountPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const count = await prisma.stockCount.findFirst({
    where: {
      id,
      location: { companyId: company.id },
    },
    include: {
      location: { select: { name: true, type: true } },
      lines: {
        include: { material: { select: { code: true, name: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!count) notFound();

  const totalSystem = count.lines.reduce((s, l) => s + toNum(l.systemQty), 0);
  const totalCounted = count.lines.reduce((s, l) => s + toNum(l.countedQty), 0);
  const totalVariance = count.lines.reduce((s, l) => s + toNum(l.variance), 0);
  const countNumber = `SC-${count.countDate.toISOString().slice(2, 10).replace(/-/g, "")}-${count.id.slice(-4).toUpperCase()}`;

  return (
    <>
      <PrintToolbar title="Stock Count Sheet" />
      <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
        <PrintHeader
          company={company}
          title="Stock Count Sheet"
          docNumber={countNumber}
          date={count.countDate}
        />

        {/* Count details */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Location</div>
            <div className="font-semibold">{count.location.name}</div>
            <div className="text-xs text-gray-500">
              {count.location.type.replace(/_/g, " ").toLowerCase()}
            </div>
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Status</div>
            <div className="font-semibold">{count.status}</div>
            <div className="text-xs text-gray-500">{formatDate(count.countDate)}</div>
          </div>
        </div>

        {/* Line items */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Material Code</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Material Name</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">System Qty</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Counted Qty</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-center font-semibold">Unit</th>
              <th className="px-2 py-1.5 text-right font-semibold">Variance</th>
            </tr>
          </thead>
          <tbody>
            {count.lines.map((line, i) => {
              const variance = toNum(line.variance);
              return (
                <tr key={line.id} className="border-b border-gray-200">
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border-r border-gray-300 px-2 py-1.5 font-mono text-xs">
                    {line.material.code}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5">{line.material.name}</td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                    {formatNumber(toNum(line.systemQty), 3)}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                    {formatNumber(toNum(line.countedQty), 3)}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                    {line.material.unit}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">
                    {variance === 0 ? (
                      <span className="text-gray-500">0</span>
                    ) : variance > 0 ? (
                      <span className="text-green-700">+{formatNumber(variance, 3)}</span>
                    ) : (
                      <span className="text-red-700">{formatNumber(variance, 3)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td colSpan={3} className="px-2 py-1.5 text-right font-semibold">Totals:</td>
              <td className="px-2 py-1.5 text-right tnum font-semibold">{formatNumber(totalSystem, 3)}</td>
              <td className="px-2 py-1.5 text-right tnum font-semibold">{formatNumber(totalCounted, 3)}</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5 text-right tnum font-bold">
                {totalVariance === 0 ? (
                  <span>0</span>
                ) : totalVariance > 0 ? (
                  <span className="text-green-700">+{formatNumber(totalVariance, 3)}</span>
                ) : (
                  <span className="text-red-700">{formatNumber(totalVariance, 3)}</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        {count.notes && (
          <div className="mt-3 text-sm">
            <span className="font-semibold">Notes: </span>
            <span>{count.notes}</span>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Counted By</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Verified By</div>
          </div>
          <div className="border-t border-black pt-1">Authorised Signatory</div>
        </div>
      </div>
    </>
  );
}
