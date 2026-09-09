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
 * Print-friendly Sale Draft / LOI (Letter of Intent).
 *
 * Mirrors the tenancy draft print view. The owner said
 * "सेल के लिए भी सकता है ये" (this should be possible for sales too).
 *
 * This is NOT the registered sale deed or ATS — it's a simple draft
 * capturing the terms discussed before the formal agreement is executed.
 * Printable on company letterhead with both parties' signature blocks.
 */
export default async function SaleDraftPage({
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
      customer: { select: { name: true, phone: true, email: true, address: true } },
      project: { select: { name: true } },
    },
  });

  if (!sale) notFound();

  // Fetch the related land parcel or built unit separately
  // (AssetSale doesn't have relation fields for these, only FKs)
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

  // Property description
  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${landParcel?.number ?? "—"}`
    : sale.assetType === "PROJECT"
      ? `Project ${sale.project?.name ?? "—"}`
      : `Unit ${builtUnit?.unitNumber ?? "—"}`;
  const projectName = builtUnit?.project?.name ?? sale.project?.name ?? "—";
  const assetArea = landParcel?.area ?? builtUnit?.area;
  const assetAreaUnit = landParcel?.areaUnit ?? builtUnit?.areaUnit ?? "sqft";

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:p-0">
      <PrintToolbar />

      {/* Letterhead */}
      <PrintHeader
        company={{
          name: company.name,
          address: company.address,
          gstin: company.gstin,
          phone: company.phone,
          email: company.email,
        }}
        title="Draft Terms / Letter of Intent"
        docNumber={sale.saleNumber}
        date={sale.draftDate ?? sale.saleDate}
        extra={
          <div className="mt-1 text-xs text-gray-500">
            This is a draft of terms discussed. Not a registered sale deed or ATS.
          </div>
        }
      />

      {/* Parties */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Parties</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-gray-300 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Seller (Owner)</p>
            <p className="font-bold">{company.name}</p>
            {company.address && <p className="text-gray-600">{company.address}</p>}
            {company.phone && <p className="text-gray-600">Ph: {company.phone}</p>}
            {company.gstin && <p className="text-gray-600">GSTIN: {company.gstin}</p>}
          </div>
          <div className="rounded border border-gray-300 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Buyer (Purchaser)</p>
            <p className="font-bold">{sale.customer.name}</p>
            {sale.customer.address && <p className="text-gray-600">{sale.customer.address}</p>}
            {sale.customer.phone && <p className="text-gray-600">Ph: {sale.customer.phone}</p>}
            {sale.customer.email && <p className="text-gray-600">Email: {sale.customer.email}</p>}
          </div>
        </div>
      </section>

      {/* Property */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Property</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Project</td>
              <td className="py-1.5">{projectName}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Asset</td>
              <td className="py-1.5">{assetLabel}</td>
            </tr>
            {assetArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Area</td>
                <td className="py-1.5">
                  {toNum(assetArea).toLocaleString("en-IN")} {assetAreaUnit}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Terms */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Terms &amp; Conditions</h2>
        <table className="w-full text-sm">
          <tbody>
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
                <td className="py-1.5">
                  <span className="font-bold">{formatCurrency(gstAmount)}</span>
                </td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Total Consideration</td>
              <td className="py-1.5">
                <span className="font-bold">{formatCurrency(total)}</span>
                <span className="ml-2 text-xs text-gray-500">({amountInWords(total)} only)</span>
              </td>
            </tr>
            {sale.paymentCycle && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Payment Cycle</td>
                <td className="py-1.5">{sale.paymentCycle}</td>
              </tr>
            )}
            {sale.dealMaturityMonths && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Deal Maturity</td>
                <td className="py-1.5">{sale.dealMaturityMonths} months</td>
              </tr>
            )}
            {sale.expectedRegistryDate && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Expected Registry Date</td>
                <td className="py-1.5">{formatDate(sale.expectedRegistryDate)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Draft notes — the informal terms discussed */}
      {sale.draftNotes && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
            Notes / Discussed Terms
          </h2>
          <div className="rounded border border-gray-300 p-3 text-sm whitespace-pre-wrap">
            {sale.draftNotes}
          </div>
        </section>
      )}

      {/* Draft document link */}
      {sale.draftDocumentUrl && (
        <section className="mt-4">
          <p className="text-xs text-gray-500">
            Draft document: {sale.draftDocumentName ?? sale.draftDocumentUrl}
          </p>
        </section>
      )}

      {/* Declaration */}
      <section className="mt-6">
        <p className="text-sm text-gray-700">
          This draft captures the terms discussed between the Seller and the Buyer on{" "}
          <strong>{formatDate(sale.draftDate ?? sale.saleDate)}</strong>. This is not a
          registered sale deed or Agreement to Sell. The formal agreement / ATS will be
          executed and registered as per applicable laws before the title is transferred.
          Both parties acknowledge the terms above as a true record of their discussion.
        </p>
      </section>

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
              <p className="text-xs text-gray-500">Buyer (Purchaser)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-200 pt-2 text-center text-xs text-gray-400">
        Draft generated on {formatDate(new Date())} · {company.name}
      </footer>
    </div>
  );
}
