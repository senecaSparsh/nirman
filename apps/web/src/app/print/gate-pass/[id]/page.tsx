import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL_ISSUE: "Material Issue",
  STOCK_TRANSFER: "Stock Transfer",
  MATERIAL_SALE: "Material Sale",
  SUPPLIER_RETURN: "Supplier Return",
  MANUAL: "Manual",
};

/**
 * Print-friendly Gate Pass — for items leaving the gate.
 * Must be carried by the driver and shown at the gate.
 */
export default async function GatePassPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.GATE_PASS_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const gp = await prisma.gatePass.findFirst({
    where: { id, companyId: company.id },
    include: {
      lines: true,
      location: { select: { name: true, type: true } },
      project: { select: { name: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
      exitedBy: { select: { name: true } },
    },
  });

  if (!gp) notFound();

  const isApproved = gp.status === "APPROVED" || gp.status === "EXITED";

  return (
    <>
      <PrintToolbar title="Gate Pass" />
      <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
        <PrintHeader
          company={company}
          title="GATE PASS"
          docNumber={gp.gatePassNumber}
          date={gp.createdAt}
        />

        {/* Warning banner */}
        <div className="mt-3 rounded-md border-2 border-black bg-yellow-50 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider">
          This gate pass must be carried by the driver and shown at the gate.
          Items cannot leave without approval.
        </div>

        {/* Gate pass details */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">From (Gate / Location)</div>
            <div className="font-semibold">{gp.location.name}</div>
            <div className="text-xs text-gray-500">{gp.location.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}</div>
            {gp.project && <div className="text-xs text-gray-500">Project: {gp.project.name}</div>}
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Category</div>
            <div className="font-semibold">{CATEGORY_LABELS[gp.category] ?? gp.category}</div>
            <div className="text-xs text-gray-500">Destination: {gp.destination ?? "—"}</div>
            {gp.purpose && <div className="text-xs text-gray-500">Purpose: {gp.purpose}</div>}
          </div>
        </div>

        {/* Vehicle details */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Vehicle Number</div>
            <div className="font-semibold">{gp.vehicleNumber ?? "—"}</div>
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Driver Name</div>
            <div className="font-semibold">{gp.driverName ?? "—"}</div>
            <div className="text-xs text-gray-500">{gp.driverPhone ?? ""}</div>
          </div>
          <div className="rounded-md border border-gray-300 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Transporter</div>
            <div className="font-semibold">{gp.transporterName ?? "—"}</div>
          </div>
        </div>

        {/* Items table */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase">S.No</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase">Material Code</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase">Description / Material</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right text-[10px] font-bold uppercase">Qty</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase">Unit</th>
            </tr>
          </thead>
          <tbody>
            {gp.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-gray-300">
                <td className="border border-gray-300 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1.5 font-mono text-xs">{l.materialCode ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1.5">{l.materialName ?? l.description ?? "—"}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold tnum">{formatNumber(toNum(l.qty), 3)}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-xs">{l.unit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Approval section */}
        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div className="border-t border-black pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Approved By</div>
            <div className="mt-8 font-semibold">{gp.approvedBy?.name ?? (isApproved ? "—" : "PENDING APPROVAL")}</div>
            <div className="text-xs text-gray-500">
              {gp.approvedAt ? new Date(gp.approvedAt).toLocaleString() : ""}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Signature</div>
          </div>
          <div className="border-t border-black pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Exit Confirmed By (Security)</div>
            <div className="mt-8 font-semibold">{gp.exitedBy?.name ?? (gp.status === "APPROVED" ? "AWAITING EXIT" : "—")}</div>
            <div className="text-xs text-gray-500">
              {gp.exitedAt ? new Date(gp.exitedAt).toLocaleString() : ""}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Signature</div>
          </div>
        </div>

        {/* Exit notes */}
        {gp.exitNotes && (
          <div className="mt-3 rounded-md border border-gray-300 px-3 py-2 text-xs">
            <span className="font-bold uppercase tracking-wide text-gray-500">Exit Notes: </span>
            {gp.exitNotes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-gray-300 pt-2 text-center text-[10px] text-gray-500">
          Generated by {gp.createdBy?.name ?? "system"} on {new Date(gp.createdAt).toLocaleString()} ·
          Status: {gp.status}
          {gp.rejectionReason && ` · Rejected: ${gp.rejectionReason}`}
          {gp.approvalNotes && ` · Approval Notes: ${gp.approvalNotes}`}
        </div>
      </div>
    </>
  );
}
