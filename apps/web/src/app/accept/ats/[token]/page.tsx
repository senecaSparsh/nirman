import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { formatCurrency, formatDate, toNum } from "@/lib/utils";
import { AcceptButton } from "./AcceptButton";

/**
 * Public ATS (Agreement to Sell) buyer-acceptance page.
 *
 * Staff issues a shareable link from the sale view ("Issue ATS link"); the
 * buyer opens /accept/ats/<token>, reviews the agreement summary, and taps
 * Accept. The token IS the auth — same pattern as employment agreements.
 * Links expire 30 days after issue; re-issuing rotates the token.
 */
export default async function AcceptAtsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sale = await prisma.assetSale.findFirst({
    where: { atsAcceptToken: token },
    select: {
      id: true,
      saleNumber: true,
      salePrice: true,
      gstAmount: true,
      saleDate: true,
      atsNo: true,
      atsDate: true,
      bbaNo: true,
      atsAcceptIssuedAt: true,
      atsBuyerAcceptedAt: true,
      atsSignerName: true,
      companyId: true,
      customer: { select: { name: true } },
      project: { select: { name: true, address: true, reraNumber: true } },
      builtUnit: { select: { unitNumber: true, area: true, areaUnit: true, floor: true } },
      landParcel: { select: { number: true } },
    },
  });
  if (!sale) notFound();

  const company = await prisma.company.findFirst({
    where: { id: sale.companyId },
    select: { name: true, address: true, phone: true, email: true },
  });

  const alreadyAccepted = sale.atsBuyerAcceptedAt != null;

  // Same 30-day window the POST endpoint enforces — an expired link must not
  // keep rendering sale terms, or the expiry only blocks the signature while
  // the data keeps leaking through forwarded messages.
  const LINK_TTL_DAYS = 30;
  const issuedAt = sale.atsAcceptIssuedAt;
  // eslint-disable-next-line react-hooks/purity -- server component, Date.now() is fine
  const expired = issuedAt != null && Date.now() - issuedAt.getTime() > LINK_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (expired) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-gray-50">
        <div className="max-w-md text-center space-y-2">
          <p className="text-lg font-bold text-gray-900">This acceptance link has expired</p>
          <p className="text-sm text-gray-500">
            Acceptance links are valid for {LINK_TTL_DAYS} days. Ask your builder contact to re-issue it.
          </p>
        </div>
      </div>
    );
  }

  const assetLabel = sale.builtUnit
    ? `Unit ${sale.builtUnit.unitNumber}${sale.builtUnit.floor != null ? ` (Floor ${sale.builtUnit.floor})` : ""}`
    : sale.landParcel ? `Plot ${sale.landParcel.number}` : "—";

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-2xl bg-white min-h-dvh shadow-sm">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Agreement to Sell</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{company?.name ?? "Builder"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sale.atsNo ? `ATS No. ${sale.atsNo}` : `Sale ${sale.saleNumber}`}
            {sale.atsDate ? ` · ${formatDate(sale.atsDate)}` : ""}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm leading-relaxed text-gray-800">
          <p>
            This Agreement to Sell is made between{" "}
            <strong>{company?.name ?? "the builder"}</strong> (the &quot;Seller&quot;) and{" "}
            <strong>{sale.customer?.name ?? "the customer"}</strong> (the &quot;Buyer&quot;).
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50 w-1/3">Property</td>
                  <td className="px-3 py-2">
                    {assetLabel}
                    {sale.project ? `, ${sale.project.name}` : ""}
                  </td>
                </tr>
                {sale.project?.address && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Location</td>
                    <td className="px-3 py-2">{sale.project.address}</td>
                  </tr>
                )}
                {sale.project?.reraNumber && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">RERA No.</td>
                    <td className="px-3 py-2">{sale.project.reraNumber}</td>
                  </tr>
                )}
                {sale.builtUnit && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Area</td>
                    <td className="px-3 py-2">
                      {toNum(sale.builtUnit.area)} {sale.builtUnit.areaUnit}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Sale Price</td>
                  <td className="px-3 py-2 font-bold">{formatCurrency(toNum(sale.salePrice))}</td>
                </tr>
                {toNum(sale.gstAmount) > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">GST</td>
                    <td className="px-3 py-2">{formatCurrency(toNum(sale.gstAmount))}</td>
                  </tr>
                )}
                {sale.bbaNo && (
                  <tr>
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">BBA No.</td>
                    <td className="px-3 py-2">{sale.bbaNo}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p>
            By accepting, you confirm that you have received, read, and agree to the Agreement to
            Sell referenced above, including the payment schedule and the sale price. This
            electronic acceptance is recorded as your signature for this agreement.
          </p>
        </div>

        {/* Acceptance section */}
        <div className="border-t px-6 py-5 bg-gray-50">
          {alreadyAccepted ? (
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 text-green-600 font-bold">
                <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Agreement Accepted
              </div>
              <p className="text-xs text-gray-500">
                Accepted on {formatDate(sale.atsBuyerAcceptedAt)}
                {sale.atsSignerName ? ` by ${sale.atsSignerName}` : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Enter your name and tap &quot;Accept Agreement&quot; to sign electronically.
              </p>
              <AcceptButton token={token} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
