import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Stock Issue Slip — matches the client's paper layout.
 * Opened in a new tab from the Issues tab. Uses window.print() via a button.
 */
export default async function IssueSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  // Gate access — issue slips show material costs and stock valuations.
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
      fromLocation: { select: { name: true } },
      issuedBy: { select: { name: true } },
      lines: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!issue) notFound();

  const targetName = issue.project?.name ?? (issue.department ? `${issue.department.code} — ${issue.department.name}` : "—");
  const totalAmount = toNum(issue.totalAmount);
  const words = amountInWords(totalAmount);

  return (
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          <div className="text-xs text-gray-600">
            {company.gstin && <span className="mr-3">GSTIN: {company.gstin}</span>}
            {company.phone && <span>Ph: {company.phone}</span>}
          </div>
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-700">Stock Issue Slip</h2>
          <p className="text-sm text-gray-600">Original Copy</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">No. {issue.issueNumber}</div>
          <div className="text-gray-600">{formatDate(issue.issueDate)}</div>
        </div>
      </div>

      {/* To + Receiver */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-semibold">To: </span>
          <span>{targetName}</span>
        </div>
        <div>
          <span className="font-semibold">From Location: </span>
          <span>{issue.fromLocation.name}</span>
        </div>
        <div>
          <span className="font-semibold">Receiver Name: </span>
          <span>{issue.receiverName ?? "—"}</span>
        </div>
        <div>
          <span className="font-semibold">Receiver Mobile: </span>
          <span>{issue.receiverMobile ?? "—"}</span>
        </div>
        <div>
          <span className="font-semibold">Issued By: </span>
          <span>{issue.issuedBy?.name ?? "—"}</span>
        </div>
      </div>

      {/* Line items table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Sr.</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description of Goods</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-r border-gray-300 px-2 py-1.5 text-right font-semibold">Rate</th>
            <th className="px-2 py-1.5 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {issue.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">
                {line.material.name}
                <span className="ml-1 text-xs text-gray-500">({line.material.code})</span>
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">
                {toNum(line.qty)} {line.material.unit}
              </td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right tnum">{formatCurrency(toNum(line.unitCost))}</td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(toNum(line.qty) * toNum(line.unitCost))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black">
            <td colSpan={4} className="px-2 py-1.5 text-right font-semibold">Total Cost:</td>
            <td className="px-2 py-1.5 text-right font-bold tnum">{formatCurrency(toNum(issue.totalCost))}</td>
          </tr>
          {toNum(issue.roundOff) !== 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-1.5 text-right font-semibold">Round Off:</td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(toNum(issue.roundOff))}</td>
            </tr>
          )}
          <tr className="border-t-2 border-black">
            <td colSpan={4} className="px-2 py-2 text-right font-bold">Amount Chargeable:</td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Amount Chargeable (in words): </span>
        <span className="italic">{words}</span>
      </div>

      {issue.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{issue.notes}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-black pt-1">For Store</div>
        <div className="border-t border-black pt-1">Receiver Signature</div>
        <div className="border-t border-black pt-1">Authorised Signatory</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Slip" />
      </div>
    </div>
  );
}
