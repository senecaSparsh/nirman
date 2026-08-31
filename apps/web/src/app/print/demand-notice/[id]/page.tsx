import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { amountInWords } from "@nirman/services";

/**
 * Demand Notice — sent to the buyer when a payment installment is due.
 *
 * P0 gap from competitor analysis. For CLP (Construction-Linked Payment),
 * the demand is triggered by a WBS milestone completion. For TLP/DPP,
 * it's triggered by the due date on the payment schedule item.
 *
 * The URL takes the PaymentScheduleItem ID — the specific installment being demanded.
 */
export default async function DemandNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return <div className="p-8 text-center text-muted-foreground">No access</div>;
  }

  const item = await prisma.paymentScheduleItem.findFirst({
    where: { id },
    include: {
      paymentSchedule: {
        include: {
          assetSale: {
            include: {
              customer: { select: { name: true, phone: true, email: true, address: true } },
              project: { select: { name: true } },
            },
          },
        },
      },
      wbsNode: { select: { name: true, code: true } },
    },
  });

  if (!item || !item.paymentSchedule?.assetSale) notFound();

  const sale = item.paymentSchedule.assetSale;
  if (sale.companyId !== company.id) notFound();

  const [landParcel, builtUnit] = await Promise.all([
    sale.landParcelId
      ? prisma.landParcel.findUnique({
          where: { id: sale.landParcelId },
          select: { number: true, area: true, areaUnit: true },
        })
      : null,
    sale.builtUnitId
      ? prisma.builtUnit.findUnique({
          where: { id: sale.builtUnitId },
          select: { unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true },
        })
      : null,
  ]);

  const amount = toNum(item.amount);
  const gstAmount = toNum(item.gstAmount);
  const totalAmount = toNum(item.totalAmount);
  const percentage = toNum(item.percentage);
  const alreadyPaid = toNum(item.paidAmount);
  const balanceDue = totalAmount - alreadyPaid;

  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${landParcel?.number ?? "—"}`
    : sale.assetType === "PROJECT"
      ? `Project ${sale.project?.name ?? "—"}`
      : `Unit ${builtUnit?.unitNumber ?? "—"}`;
  const projectName = sale.project?.name ?? "—";

  const demandNo = `DMN-${sale.saleNumber}-${String(item.installmentNo).padStart(2, "0")}`;
  const demandDate = new Date();
  const dueDate = item.dueDate ?? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15-day default

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:p-0">
      <PrintToolbar />

      <PrintHeader
        company={{
          name: company.name,
          address: company.address,
          gstin: company.gstin,
          phone: company.phone,
          email: company.email,
        }}
        title="Demand Notice"
        docNumber={demandNo}
        date={demandDate}
        extra={
          <div className="mt-1 text-xs text-gray-500">
            Installment #{item.installmentNo} · Due: {formatDate(dueDate)}
          </div>
        }
      />

      {/* Addressee */}
      <section className="mt-6">
        <div className="rounded border border-gray-300 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-gray-500">To</p>
          <p className="font-bold">{sale.customer.name}</p>
          {sale.customer.address && <p className="text-gray-600">{sale.customer.address}</p>}
          {sale.customer.phone && <p className="text-gray-600">Ph: {sale.customer.phone}</p>}
          {sale.customer.email && <p className="text-gray-600">Email: {sale.customer.email}</p>}
        </div>
      </section>

      {/* Subject */}
      <section className="mt-4">
        <p className="text-sm font-bold">
          Subject: Demand for Payment — Installment {item.installmentNo} ({item.description})
          {" "}for {assetLabel}, {projectName}
        </p>
      </section>

      {/* Body */}
      <section className="mt-4 space-y-3 text-sm leading-relaxed text-gray-800">
        <p>Dear {sale.customer.name},</p>
        <p>
          Pursuant to the allotment letter and the payment schedule agreed upon for {assetLabel}
          {" "}in {projectName}, you are hereby requested to remit the{" "}
          <strong>{item.installmentNo === 1 ? "first" : `${item.installmentNo}th`} installment</strong>{" "}
          towards the sale consideration as per the details below:
        </p>
      </section>

      {/* Demand details */}
      <section className="mt-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
          Demand Details
        </h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Sale Reference</td>
              <td className="py-1.5 font-mono">{sale.saleNumber}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Project</td>
              <td className="py-1.5">{projectName}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Unit / Plot</td>
              <td className="py-1.5">{assetLabel}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Installment No.</td>
              <td className="py-1.5">{item.installmentNo}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Description</td>
              <td className="py-1.5">{item.description}</td>
            </tr>
            {item.wbsNode && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Milestone Trigger</td>
                <td className="py-1.5">{item.wbsNode.name} ({item.wbsNode.code})</td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">% of Total</td>
              <td className="py-1.5">{percentage.toFixed(2)}%</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Base Amount</td>
              <td className="py-1.5 font-bold">{formatCurrency(amount)}</td>
            </tr>
            {gstAmount > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">GST</td>
                <td className="py-1.5">{formatCurrency(gstAmount)}</td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Total Installment</td>
              <td className="py-1.5 font-bold">{formatCurrency(totalAmount)}</td>
            </tr>
            {alreadyPaid > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Already Paid</td>
                <td className="py-1.5 text-gray-600">−{formatCurrency(alreadyPaid)}</td>
              </tr>
            )}
            <tr className="border-b-2 border-gray-400 bg-gray-50">
              <td className="py-2 pr-4 font-bold text-gray-700">Balance Due</td>
              <td className="py-2 text-base font-bold">
                {formatCurrency(balanceDue)}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({amountInWords(balanceDue)} only)
                </span>
              </td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Due Date</td>
              <td className="py-1.5 font-bold text-red-700">{formatDate(dueDate)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Payment instructions */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
          Payment Instructions
        </h2>
        <div className="rounded border border-gray-300 p-3 text-sm text-gray-800">
          <p className="mb-2">
            Please remit the balance due on or before the due date to the following bank account:
          </p>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 font-semibold text-gray-600">Beneficiary</td>
                <td className="py-1">{company.name}</td>
              </tr>
              {company.gstin && (
                <tr>
                  <td className="py-1 pr-4 font-semibold text-gray-600">GSTIN</td>
                  <td className="py-1">{company.gstin}</td>
                </tr>
              )}
              <tr>
                <td className="py-1 pr-4 font-semibold text-gray-600">Bank</td>
                <td className="py-1 text-gray-500">[Please contact our office for bank details]</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-semibold text-gray-600">Reference</td>
                <td className="py-1 font-mono">{demandNo} · {sale.saleNumber}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Late payment warning */}
      <section className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Important — Late Payment Interest</p>
        <p className="mt-1">
          Delay in payment beyond the due date will attract interest at the rate specified in the
          Builder-Buyer Agreement (typically 18% per annum on the overdue amount), calculated on a
          daily basis from the due date until the date of actual receipt.
        </p>
      </section>

      {/* Signature */}
      <section className="mt-12">
        <div className="border-t border-gray-400 pt-2">
          <p className="text-sm font-bold">For {company.name}</p>
          <p className="text-xs text-gray-500">Accounts Department</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-200 pt-2 text-center text-xs text-gray-400">
        This is a computer-generated demand notice · {company.name} · {formatDate(new Date())}
      </footer>
    </div>
  );
}
