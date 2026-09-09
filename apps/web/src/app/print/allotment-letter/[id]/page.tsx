import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { amountInWords } from "@nirman/services";

/**
 * Allotment Letter — issued at booking to formalise the unit/plot allotment.
 *
 * This is a P0 gap from the competitor analysis (4QT core feature).
 * The schema already tracks `allotmentLetterNo` and `allotmentDate` on AssetSale;
 * this print template generates the formal letter on company letterhead.
 */
export default async function AllotmentLetterPage({
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

  const sale = await prisma.assetSale.findFirst({
    where: {...await scopeWhere("AssetSale"),  id, companyId: company.id },
    include: {
      customer: { select: { name: true, phone: true, email: true, address: true, gstin: true } },
      project: { select: { name: true } },
      paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
    },
  });

  if (!sale) notFound();

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
          select: { unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true, project: { select: { name: true } } },
        })
      : null,
  ]);

  const salePrice = toNum(sale.salePrice);
  const gstRate = toNum(sale.gstRate);
  const gstAmount = toNum(sale.gstAmount);
  const total = salePrice + gstAmount;
  const depositAmount = sale.depositAmount ? toNum(sale.depositAmount) : 0;

  // Property description
  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${landParcel?.number ?? "—"}`
    : sale.assetType === "PROJECT"
      ? `Project ${sale.project?.name ?? "—"}`
      : `Unit ${builtUnit?.unitNumber ?? "—"}`;
  const projectName = builtUnit?.project?.name ?? sale.project?.name ?? "—";
  const assetArea = landParcel?.area ?? builtUnit?.area;
  const assetAreaUnit = landParcel?.areaUnit ?? builtUnit?.areaUnit ?? "sqft";

  const allotmentNo = sale.allotmentLetterNo ?? `ALL-${sale.saleNumber}`;
  const allotmentDate = sale.allotmentDate ?? sale.saleDate;

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
        title="Allotment Letter"
        docNumber={allotmentNo}
        date={allotmentDate}
        extra={
          <div className="mt-1 text-xs text-gray-500">
            Reference: Sale {sale.saleNumber}
          </div>
        }
      />

      {/* Addressee */}
      <section className="mt-6">
        <p className="text-sm text-gray-600">Date: {formatDate(allotmentDate)}</p>
        <div className="mt-3 rounded border border-gray-300 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Allotted To</p>
          <p className="font-bold">{sale.customer.name}</p>
          {sale.customer.address && <p className="text-gray-600">{sale.customer.address}</p>}
          {sale.customer.phone && <p className="text-gray-600">Ph: {sale.customer.phone}</p>}
          {sale.customer.email && <p className="text-gray-600">Email: {sale.customer.email}</p>}
          {sale.customer.gstin && <p className="text-gray-600">GSTIN: {sale.customer.gstin}</p>}
        </div>
      </section>

      {/* Subject */}
      <section className="mt-4">
        <p className="text-sm font-bold">
          Subject: Allotment of {assetLabel} in {projectName}
        </p>
      </section>

      {/* Body */}
      <section className="mt-4 space-y-3 text-sm leading-relaxed text-gray-800">
        <p>Dear {sale.customer.name},</p>
        <p>
          We are pleased to inform you that {assetLabel} in {projectName} (the &quot;Property&quot;)
          {" "}has been allotted to you pursuant to your booking and payment of the booking deposit
          {depositAmount > 0 && <> of <strong>{formatCurrency(depositAmount)}</strong></>}
          {" "}received on <strong>{formatDate(sale.depositDate ?? sale.saleDate)}</strong>.
          {" "}The details of the allotment are as follows:
        </p>
      </section>

      {/* Allotment details table */}
      <section className="mt-4">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Allotment No.</td>
              <td className="py-1.5 font-mono">{allotmentNo}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Project</td>
              <td className="py-1.5">{projectName}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Allotted Unit / Plot</td>
              <td className="py-1.5">{assetLabel}</td>
            </tr>
            {builtUnit && (
              <>
                {builtUnit.wing && (
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5 pr-4 font-semibold text-gray-600">Wing</td>
                    <td className="py-1.5">{builtUnit.wing}</td>
                  </tr>
                )}
                {builtUnit.floor != null && (
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5 pr-4 font-semibold text-gray-600">Floor</td>
                    <td className="py-1.5">{builtUnit.floor}</td>
                  </tr>
                )}
                <tr className="border-b border-gray-200">
                  <td className="py-1.5 pr-4 font-semibold text-gray-600">Unit Type</td>
                  <td className="py-1.5">{builtUnit.unitType}</td>
                </tr>
              </>
            )}
            {assetArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Super Built-up Area</td>
                <td className="py-1.5">
                  {toNum(assetArea).toLocaleString("en-IN")} {assetAreaUnit}
                </td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Sale Price</td>
              <td className="py-1.5">
                <span className="font-bold">{formatCurrency(salePrice)}</span>
                <span className="ml-2 text-xs text-gray-500">({amountInWords(salePrice)} only)</span>
              </td>
            </tr>
            {gstRate > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">GST @ {gstRate}%</td>
                <td className="py-1.5 font-bold">{formatCurrency(gstAmount)}</td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Total Consideration</td>
              <td className="py-1.5">
                <span className="font-bold">{formatCurrency(total)}</span>
                <span className="ml-2 text-xs text-gray-500">({amountInWords(total)} only)</span>
              </td>
            </tr>
            {sale.expectedRegistryDate && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Expected Registry Date</td>
                <td className="py-1.5">{formatDate(sale.expectedRegistryDate)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Payment schedule (if exists) */}
      {sale.paymentSchedule && sale.paymentSchedule.items.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
            Payment Schedule
          </h2>
          <table className="w-full border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-b border-gray-300 px-2 py-1.5 text-left">#</th>
                <th className="border-b border-gray-300 px-2 py-1.5 text-left">Description</th>
                <th className="border-b border-gray-300 px-2 py-1.5 text-right">%</th>
                <th className="border-b border-gray-300 px-2 py-1.5 text-right">Amount</th>
                {sale.paymentSchedule.type === "CLP" ? (
                  <th className="border-b border-gray-300 px-2 py-1.5 text-left">Trigger</th>
                ) : (
                  <th className="border-b border-gray-300 px-2 py-1.5 text-right">Due Date</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sale.paymentSchedule.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="px-2 py-1.5">{item.installmentNo}</td>
                  <td className="px-2 py-1.5">{item.description}</td>
                  <td className="px-2 py-1.5 text-right">{toNum(item.percentage).toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{formatCurrency(toNum(item.totalAmount))}</td>
                  {sale.paymentSchedule?.type === "CLP" ? (
                    <td className="px-2 py-1.5 text-xs text-gray-600">
                      {item.wbsNodeId ? "On milestone" : "On booking"}
                    </td>
                  ) : (
                    <td className="px-2 py-1.5 text-right">
                      {item.dueDate ? formatDate(item.dueDate) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Terms & Conditions */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
          Terms &amp; Conditions
        </h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-800">
          <li>
            This allotment letter is issued based on the booking deposit received and does not
            constitute a transfer of title. Title shall pass only upon execution and registration
            of the sale deed.
          </li>
          <li>
            The allottee shall pay all subsequent installments as per the payment schedule above.
            Delay in payment beyond the due date may attract interest as per the agreement.
          </li>
          <li>
            The allottee shall execute the Builder-Buyer Agreement (BBA) / Agreement to Sell (ATS)
            within the stipulated time frame from the date of this allotment letter.
          </li>
          <li>
            Possession of the Property shall be handed over upon completion of construction and
            receipt of the full consideration, subject to force majeure conditions.
          </li>
          <li>
            The allottee shall comply with all statutory requirements including payment of stamp
            duty, registration charges, GST, and any other applicable taxes.
          </li>
          <li>
            This allotment is subject to the terms and conditions of the Builder-Buyer Agreement
            to be executed between the parties. In case of any conflict, the BBA shall prevail.
          </li>
          <li>
            The Seller reserves the right to cancel the allotment if the allottee fails to comply
            with the payment schedule or other terms mentioned herein, subject to the RERA
            regulations applicable in the jurisdiction.
          </li>
        </ol>
      </section>

      {/* Allotment document reference */}
      {sale.allotmentDocumentUrl && (
        <section className="mt-4">
          <p className="text-xs text-gray-500">
            Allotment document: {sale.allotmentDocumentName ?? sale.allotmentDocumentUrl}
          </p>
        </section>
      )}

      {/* Signatures */}
      <section className="mt-12">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-bold">For {company.name}</p>
              <p className="text-xs text-gray-500">Authorised Signatory</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-bold">{sale.customer.name}</p>
              <p className="text-xs text-gray-500">Allottee (Acknowledged &amp; Accepted)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-200 pt-2 text-center text-xs text-gray-400">
        This is a computer-generated allotment letter · {company.name} · {formatDate(new Date())}
      </footer>
    </div>
  );
}
