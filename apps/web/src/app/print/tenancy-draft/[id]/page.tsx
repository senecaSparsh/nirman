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
 * Print-friendly Tenancy Draft / LOI (Letter of Intent).
 *
 * The client's request: "ना रेंट एग्रीमेंट का नहीं एक सिंपल एक ड्राफ्ट
 * जैसे आज तेरा मेरा एग्रीमेंट हुआ बैठ के। लेकिन टेनेंटी शुरू होगी तीन
 * महीने बाद। ठीक है। तो मैं आज जो तेरी मेरी वो चीजें डिस्कस हुई हैं
 * वो इस पे डाल दूंगा।"
 *
 * This is NOT the registered rent agreement — it's a simple draft capturing
 * the terms discussed before the formal agreement is registered. Printable
 * on company letterhead with both parties' signature blocks.
 */
export default async function TenancyDraftPage({
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

  const tenancy = await prisma.tenancy.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { name: true, phone: true, email: true, address: true } },
      project: { select: { name: true } },
    },
  });

  if (!tenancy) notFound();

  // Fetch the related built unit or land parcel separately
  // (Tenancy model doesn't have relation fields for these, only FKs)
  const [builtUnit, landParcel] = await Promise.all([
    tenancy.builtUnitId
      ? prisma.builtUnit.findUnique({
          where: { id: tenancy.builtUnitId },
          select: { unitNumber: true, area: true, floor: true, wing: true, project: { select: { name: true } } },
        })
      : null,
    tenancy.landParcelId
      ? prisma.landParcel.findUnique({
          where: { id: tenancy.landParcelId },
          select: { number: true, area: true, areaUnit: true },
        })
      : null,
  ]);

  const monthlyRent = toNum(tenancy.monthlyRent);
  const securityDeposit = toNum(tenancy.securityDeposit);
  const rentFreeDays = tenancy.rentFreeDays ?? 0;
  const escalationPct = tenancy.escalationPercent ? toNum(tenancy.escalationPercent) : null;

  // Compute rent start date (after rent-free period)
  const rentStartDate = new Date(tenancy.startDate);
  rentStartDate.setDate(rentStartDate.getDate() + rentFreeDays);

  // Property description
  const propertyName = builtUnit
    ? `${builtUnit.unitNumber}${builtUnit.wing ? `, Wing ${builtUnit.wing}` : ""}${builtUnit.floor ? `, Floor ${builtUnit.floor}` : ""}`
    : landParcel?.number ?? "—";
  const projectName = builtUnit?.project?.name ?? tenancy.project?.name ?? "—";
  const propertyArea = builtUnit?.area ?? landParcel?.area;
  const propertyAreaUnit = landParcel?.areaUnit ?? "sqft";

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
        docNumber={tenancy.rentAgreementNo ?? `DRAFT-${tenancy.id.slice(-6).toUpperCase()}`}
        date={tenancy.draftDate ?? tenancy.createdAt}
        extra={
          <div className="mt-1 text-xs text-gray-500">
            This is a draft of terms discussed. Not a registered agreement.
          </div>
        }
      />

      {/* Parties */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Parties</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-gray-300 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Lessor (Landlord)</p>
            <p className="font-bold">{company.name}</p>
            {company.address && <p className="text-gray-600">{company.address}</p>}
            {company.phone && <p className="text-gray-600">Ph: {company.phone}</p>}
            {company.gstin && <p className="text-gray-600">GSTIN: {company.gstin}</p>}
          </div>
          <div className="rounded border border-gray-300 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Lessee (Tenant)</p>
            <p className="font-bold">{tenancy.tenantName}</p>
            {tenancy.customer?.address && <p className="text-gray-600">{tenancy.customer.address}</p>}
            {tenancy.customer?.phone && <p className="text-gray-600">Ph: {tenancy.customer.phone}</p>}
            {tenancy.tenantPhone && <p className="text-gray-600">Ph: {tenancy.tenantPhone}</p>}
            {tenancy.tenantEmail && <p className="text-gray-600">Email: {tenancy.tenantEmail}</p>}
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
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Unit / Plot</td>
              <td className="py-1.5">{propertyName}</td>
            </tr>
            {propertyArea != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Area</td>
                <td className="py-1.5">
                  {toNum(propertyArea).toLocaleString("en-IN")} {propertyAreaUnit}
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
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Tenancy Start Date</td>
              <td className="py-1.5">{formatDate(tenancy.startDate)}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Tenancy End Date</td>
              <td className="py-1.5">{formatDate(tenancy.endDate)}</td>
            </tr>
            {rentFreeDays > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Rent-Free / Fit-Out Period</td>
                <td className="py-1.5">
                  {rentFreeDays} days (rent starts from {formatDate(rentStartDate)})
                </td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-4 font-semibold text-gray-600">Monthly Rent</td>
              <td className="py-1.5">
                <span className="font-bold">{formatCurrency(monthlyRent)}</span>
                <span className="ml-2 text-xs text-gray-500">({amountInWords(monthlyRent)} only)</span>
              </td>
            </tr>
            {securityDeposit > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Security Deposit</td>
                <td className="py-1.5">
                  <span className="font-bold">{formatCurrency(securityDeposit)}</span>
                  <span className="ml-2 text-xs text-gray-500">({amountInWords(securityDeposit)} only)</span>
                </td>
              </tr>
            )}
            {escalationPct != null && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">Yearly Escalation</td>
                <td className="py-1.5">
                  {escalationPct}% every {tenancy.escalationIntervalMonths} months
                </td>
              </tr>
            )}
            {tenancy.sacCode && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pr-4 font-semibold text-gray-600">SAC Code (GST)</td>
                <td className="py-1.5">{tenancy.sacCode}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Draft notes — the informal terms discussed */}
      {tenancy.draftNotes && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
            Notes / Discussed Terms
          </h2>
          <div className="rounded border border-gray-300 p-3 text-sm whitespace-pre-wrap">
            {tenancy.draftNotes}
          </div>
        </section>
      )}

      {/* Declaration */}
      <section className="mt-6">
        <p className="text-sm text-gray-700">
          This draft captures the terms discussed between the Lessor and the Lessee on{" "}
          <strong>{formatDate(tenancy.draftDate ?? tenancy.createdAt)}</strong>. This is not a
          registered rent agreement. The formal agreement will be executed and registered as per
          applicable laws before the tenancy commences. Both parties acknowledge the terms above
          as a true record of their discussion.
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
              <p className="text-sm font-bold">{tenancy.tenantName}</p>
              <p className="text-xs text-gray-500">Tenant (Lessee)</p>
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
