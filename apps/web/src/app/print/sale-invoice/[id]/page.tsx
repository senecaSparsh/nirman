import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Sale Invoice / Allotment Letter — for asset sales (land or built unit).
 * Shows the sale with customer info, asset details, pricing breakdown, GST,
 * payment history, amount in words, terms, and signature blocks.
 * Opened in a new tab from the Sale detail dialog.
 */
export default async function SaleInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const sale = await prisma.assetSale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { name: true, phone: true, email: true, address: true, gstin: true } },
      project: { select: { name: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      createdBy: { select: { name: true } },
    },
  });

  if (!sale) notFound();

  // Fetch land parcel or built unit separately (no direct relation on AssetSale)
  const landParcel = sale.landParcelId
    ? await prisma.landParcel.findUnique({ where: { id: sale.landParcelId }, select: { number: true, area: true, areaUnit: true } })
    : null;
  const builtUnit = sale.builtUnitId
    ? await prisma.builtUnit.findUnique({ where: { id: sale.builtUnitId }, select: { unitNumber: true, unitType: true, area: true, areaUnit: true, carpetArea: true, superBuiltUpArea: true } })
    : null;

  const salePrice = toNum(sale.salePrice);
  const gstAmount = toNum(sale.gstAmount);
  const total = salePrice + gstAmount;
  const words = amountInWords(total);
  const totalPaid = sale.payments.reduce((s, p) => s + toNum(p.amount), 0);
  const balanceDue = total - totalPaid;

  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${landParcel?.number ?? "—"}`
    : `Unit ${builtUnit?.unitNumber ?? "—"}`;

  return (<>
          <PrintToolbar title={`Invoice ${sale.saleNumber}`} />
    <div className="print-page mx-auto max-w-3xl bg-white p-8 text-black print:p-4">
      <PrintHeader
        company={company}
        title={sale.assetType === "LAND" ? "Land Allotment Letter" : "Unit Allotment Letter"}
        docNumber={sale.saleNumber}
        date={sale.saleDate}
      />

      {/* Company + Customer info */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">From</div>
          <div className="font-semibold">{company.name}</div>
          {company.email && <div className="text-xs text-gray-500">{company.email}</div>}
          <div className="text-xs text-gray-500">
            {company.gstin && <span className="mr-2">GSTIN: {company.gstin}</span>}
            {company.pan && <span>PAN: {company.pan}</span>}
          </div>
        </div>
        <div className="rounded-md border border-gray-300 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Bill To</div>
          <div className="font-semibold">{sale.customer.name}</div>
          {sale.customer.address && <div className="text-xs text-gray-500">{sale.customer.address}</div>}
          {sale.customer.phone && <div className="text-xs text-gray-500">Ph: {sale.customer.phone}</div>}
          {sale.customer.email && <div className="text-xs text-gray-500">{sale.customer.email}</div>}
          {sale.customer.gstin && <div className="text-xs text-gray-500">GSTIN: {sale.customer.gstin}</div>}
        </div>
      </div>

      {/* Asset details */}
      <div className="mt-4 rounded-md border border-gray-300 p-3 text-sm">
        <div className="mb-1 font-semibold">Asset Details</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Type: </span>
            <span>{assetLabel}</span>
          </div>
          <div>
            <span className="text-gray-600">Project: </span>
            <span>{sale.project?.name ?? "Standalone"}</span>
          </div>
          {builtUnit && (
            <div>
              <span className="text-gray-600">Unit Type: </span>
              <span>{builtUnit.unitType.replace(/_/g, " ")}</span>
            </div>
          )}
          {builtUnit?.area && (
            <div>
              <span className="text-gray-600">Area: </span>
              <span>{formatNumber(toNum(builtUnit.area))} {builtUnit.areaUnit ?? "Sq.Ft"}</span>
            </div>
          )}
          {builtUnit?.superBuiltUpArea && (
            <div>
              <span className="text-gray-600">Super Built-Up Area: </span>
              <span>{formatNumber(toNum(builtUnit.superBuiltUpArea))} {builtUnit.areaUnit ?? "Sq.Ft"}</span>
            </div>
          )}
          {builtUnit?.carpetArea && (
            <div>
              <span className="text-gray-600">Carpet Area (RERA): </span>
              <span>{formatNumber(toNum(builtUnit.carpetArea))} {builtUnit.areaUnit ?? "Sq.Ft"}</span>
            </div>
          )}
          {landParcel?.area && (
            <div>
              <span className="text-gray-600">Area: </span>
              <span>{formatNumber(toNum(landParcel.area))} {landParcel.areaUnit ?? "Sq.Ft"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pricing table */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-gray-300 px-2 py-1.5 text-left font-semibold">Description</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="border-r border-gray-300 px-2 py-1.5">
              Sale Price — {assetLabel}
              {builtUnit?.area && (() => {
                const pricingArea = builtUnit.superBuiltUpArea ? toNum(builtUnit.superBuiltUpArea) : toNum(builtUnit.area);
                return (
                  <span className="ml-1 text-xs text-gray-500">
                    ({formatNumber(pricingArea)} {builtUnit.areaUnit ?? "Sq.Ft"} @ {formatCurrency(salePrice / (pricingArea || 1))}/Sq.Ft)
                  </span>
                );
              })()}
            </td>
            <td className="px-2 py-1.5 text-right tnum">{formatCurrency(salePrice)}</td>
          </tr>
          {gstAmount > 0 && (
            <tr className="border-b border-gray-200">
              <td className="border-r border-gray-300 px-2 py-1.5">
                GST @ {toNum(sale.gstRate)}%
              </td>
              <td className="px-2 py-1.5 text-right tnum">{formatCurrency(gstAmount)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black">
            <td className="px-2 py-2 text-right font-bold">Grand Total:</td>
            <td className="px-2 py-2 text-right font-bold tnum">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Amount in words */}
      <div className="mt-3 text-sm">
        <span className="font-semibold">Amount in Words: </span>
        <span className="italic">{words}</span>
      </div>

      {/* Payment history */}
      {sale.payments.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-sm font-semibold">Payment History</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-400">
                <th className="border-r border-gray-300 px-2 py-1 text-left font-semibold">Date</th>
                <th className="border-r border-gray-300 px-2 py-1 text-left font-semibold">Mode</th>
                <th className="border-r border-gray-300 px-2 py-1 text-left font-semibold">Reference</th>
                <th className="px-2 py-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-200">
                  <td className="border-r border-gray-300 px-2 py-1">{formatDate(p.paymentDate)}</td>
                  <td className="border-r border-gray-300 px-2 py-1">{p.mode.replace(/_/g, " ")}</td>
                  <td className="border-r border-gray-300 px-2 py-1 text-gray-600">{p.reference ?? "—"}</td>
                  <td className="px-2 py-1 text-right tnum">{formatCurrency(toNum(p.amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-400">
                <td colSpan={3} className="px-2 py-1.5 text-right font-semibold">Total Paid:</td>
                <td className="px-2 py-1.5 text-right font-bold tnum">{formatCurrency(totalPaid)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1.5 text-right font-semibold">Balance Due:</td>
                <td className="px-2 py-1.5 text-right font-bold tnum text-red-600">{formatCurrency(balanceDue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="mt-4 border-t border-gray-300 pt-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">Terms &amp; Conditions:</div>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>This allotment is subject to receipt of full payment as per the agreed schedule.</li>
          <li>Registration charges, stamp duty, and other statutory fees are payable by the allottee.</li>
          <li>Possession will be handed over after full payment and completion of the unit.</li>
          <li>Any modifications to the unit must be approved in writing.</li>
          <li>This is a computer-generated document and does not require a physical signature.</li>
        </ol>
      </div>

      {sale.notes && (
        <div className="mt-2 text-sm">
          <span className="font-semibold">Notes: </span>
          <span>{sale.notes}</span>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-10 grid grid-cols-2 gap-12 text-center text-sm">
        <div className="border-t border-black pt-1">
          <div className="text-gray-600">Allottee Signature</div>
          <div className="mt-1 font-medium">{sale.customer.name}</div>
        </div>
        <div className="border-t border-black pt-1">
          <div className="text-gray-600">For {company.name}</div>
          <div className="mt-1 font-medium">Authorised Signatory</div>
        </div>
      </div>

    </div>
    </>
  );
}
