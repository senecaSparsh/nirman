import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Material Issue Slip — for issuing materials from
 * a store to a project, department, or built unit.
 */
export default async function IssueSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const issue = await prisma.materialIssue.findFirst({
    where: {
      id,
      OR: [
        { project: { companyId: company.id } },
        { department: { companyId: company.id } },
      ],
    },
    include: {
      project: { select: { name: true } },
      department: { select: { code: true, name: true } },
      builtUnit: { select: { unitNumber: true } },
      fromLocation: { select: { name: true } },
      issuedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true, hsnCode: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!issue) notFound();

  const targetName = issue.project?.name
    ?? (issue.department ? `${issue.department.code} — ${issue.department.name}` : "—");
  const totalAmount = toNum(issue.totalAmount);
  const words = amountInWords(totalAmount);

  return (
    <>
      <PrintToolbar title="Material Issue Slip" />
      <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
        <PrintHeader
          company={company}
          title="Material Issue Slip"
          docNumber={issue.issueNumber ?? "—"}
          date={issue.issueDate}
        />

        {/* Issue details */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Issued To</div>
            <div className="font-semibold">{targetName}</div>
            {issue.builtUnit && (
              <div className="text-xs text-gray-500">Unit: {issue.builtUnit.unitNumber}</div>
            )}
            {issue.receiverName && (
              <div className="text-xs text-gray-500">Receiver: {issue.receiverName}</div>
            )}
            {issue.receiverMobile && (
              <div className="text-xs text-gray-500">Ph: {issue.receiverMobile}</div>
            )}
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">From Store</div>
            <div className="font-semibold">{issue.fromLocation.name}</div>
            <div className="text-xs text-gray-500">Issued by: {issue.issuedBy?.name ?? "—"}</div>
          </div>
        </div>

        {/* Line items */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-center font-semibold">HSN</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-center font-semibold">Per</th>
              <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
              <th className="px-2 py-1.5 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((line, i) => {
              const value = toNum(line.qty) * toNum(line.unitCost);
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
                    {toNum(line.qty)}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center text-gray-600">
                    {line.material.unit}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                    {formatCurrency(toNum(line.unitCost))}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{formatCurrency(value)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Total Cost:</td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(toNum(issue.totalCost))}</td>
            </tr>
            {toNum(issue.roundOff) !== 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-1.5 text-right font-semibold">Round Off:</td>
                <td className="px-2 py-1.5 text-right tnum">{formatCurrency(toNum(issue.roundOff))}</td>
              </tr>
            )}
            <tr className="border-t-2 border-black">
              <td colSpan={6} className="px-2 py-2 text-right font-bold">Amount Chargeable:</td>
              <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Amount in words */}
        <div className="mt-3 text-sm">
          <span className="font-semibold">In Words: </span>
          <span className="italic">{words}</span>
        </div>

        {issue.notes && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Notes: </span>
            <span>{issue.notes}</span>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">For Store</div>
            <div className="mt-0.5 font-medium">{issue.issuedBy?.name ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-gray-600">Receiver Signature</div>
            <div className="mt-0.5 font-medium">{issue.receiverName ?? "—"}</div>
          </div>
          <div className="border-t border-black pt-1">Authorised Signatory</div>
        </div>
      </div>
    </>
  );
}
