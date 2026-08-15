import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Demand Slip — matches the client's paper layout.
 * Shows the requisition with stock context (current stock, last rate, preferred supplier)
 * and three signature blocks: Purchaser / Store / MD.
 */
export default async function DemandSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  // Gate access — demand slips show stock levels, rates, and supplier info.
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const req = await prisma.materialRequisition.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { name: true } },
      phase: { select: { name: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
          preferredSupplier: { select: { name: true, phone: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!req) notFound();

  const statusLabel: Record<string, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted — Pending Approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CONVERTED: "Converted to PO",
  };

  return (
    <div className="print-page mx-auto max-w-3xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          <div className="text-xs text-gray-600">
            {company.gstin && <span className="mr-3">GSTIN: {company.gstin}</span>}
            {company.phone && <span>Ph: {company.phone}</span>}
          </div>
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-700">Demand Slip</h2>
          <p className="text-sm text-gray-600">Material Requisition</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">{req.reqNumber}</div>
          <div className="text-gray-600">{formatDate(req.requestDate)}</div>
          <div className="mt-1 font-semibold">{statusLabel[req.status] ?? req.status}</div>
        </div>
      </div>

      {/* Project + Phase */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-semibold">Project: </span>
          <span>{req.project?.name ?? "—"}</span>
        </div>
        <div>
          <span className="font-semibold">Phase: </span>
          <span>{req.phase?.name ?? "—"}</span>
        </div>
        <div>
          <span className="font-semibold">Requested By: </span>
          <span>{req.requestedBy?.name ?? "—"}</span>
        </div>
        <div>
          <span className="font-semibold">Needed By: </span>
          <span>{req.neededByDate ? formatDate(req.neededByDate) : "—"}</span>
        </div>
      </div>

      {/* Line items table with stock context */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Material</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty Requested</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Current Stock</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Preferred Supplier</th>
            <th className="px-2 py-1.5 text-right font-semibold">Last Rate</th>
          </tr>
        </thead>
        <tbody>
          {req.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.material.name}
                <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {formatNumber(toNum(line.qtyRequested))} {line.material.unit}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {line.currentStock != null ? `${formatNumber(toNum(line.currentStock))} ${line.material.unit}` : "—"}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.preferredSupplier ? (
                  <span>
                    {line.preferredSupplier.name}
                    {line.preferredSupplier.phone && <span className="ml-1 text-xs text-gray-500">{line.preferredSupplier.phone}</span>}
                  </span>
                ) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tnum">
                {line.lastRate != null ? (
                  <span>
                    {formatCurrency(toNum(line.lastRate))}
                    {line.lastRateDate && <div className="text-xs text-gray-500">{formatDate(line.lastRateDate)}</div>}
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {req.notes && (
        <div className="mt-3 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{req.notes}</span>
        </div>
      )}

      {req.approvalNotes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Approval Notes: </span>
          <span>{req.approvalNotes}</span>
        </div>
      )}

      {req.rejectReason && (
        <div className="mt-2 text-sm text-red-700">
          <span className="font-semibold">Reject Reason: </span>
          <span>{req.rejectReason}</span>
        </div>
      )}

      {/* Three signature blocks — Purchaser / Store / MD */}
      <div className="mt-16 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">For Purchaser</div>
        <div className="border-t border-black pt-1">For Store</div>
        <div className="border-t border-black pt-1">For MD / Authorised Signatory</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Demand Slip" />
      </div>
    </div>
  );
}
