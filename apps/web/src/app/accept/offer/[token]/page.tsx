import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AcceptButton } from "./AcceptButton";

/**
 * Public offer acceptance page — accessible via shareable link.
 * URL: /accept/offer/[token]
 *
 * No auth required — the token IS the auth. The employee views the
 * offer details and taps "Accept" to confirm.
 */
export default async function AcceptOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;

  const employee = await prisma.employee.findFirst({
    where: { offerToken: token, deletedAt: null },
    select: {
      id: true,
      name: true,
      designation: true,
      trade: true,
      employmentType: true,
      wageType: true,
      dailyRate: true,
      monthlySalary: true,
      joinDate: true,
      contractStartDate: true,
      contractEndDate: true,
      probationEndDate: true,
      noticePeriodDays: true,
      offerLetterStatus: true,
      offerLetterIssuedAt: true,
      offerLetterAcceptedAt: true,
      offerLetterTerms: true,
      companyId: true,
    },
  });

  if (!employee) notFound();

  const company = await prisma.company.findFirst({
    where: { id: employee.companyId },
    select: { name: true, address: true, phone: true, email: true },
  });

  const alreadyAccepted = employee.offerLetterStatus === "CONFIRMED";
  const issued = ["ISSUED", "CONFIRMED"].includes(employee.offerLetterStatus ?? "");

  if (!issued) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-gray-50">
        <div className="max-w-md text-center space-y-2">
          <p className="text-lg font-bold text-gray-900">Offer not yet issued</p>
          <p className="text-sm text-gray-500">
            The offer letter has not been issued yet. Please contact your HR representative.
          </p>
        </div>
      </div>
    );
  }

  const employmentTypeLabel: Record<string, string> = {
    PERMANENT: "Permanent Employment",
    CONTRACT: "Fixed-Term Contract",
    CASUAL: "Casual Employment",
    PROBATION: "Probationary Employment",
    INTERN: "Internship",
  };
  const typeLabel = employmentTypeLabel[employee.employmentType ?? "PERMANENT"] ?? "Employment";

  const wageText =
    employee.wageType === "DAILY"
      ? `Daily wage of ${formatCurrency(toNum(employee.dailyRate))} per working day`
      : `Monthly salary of ${formatCurrency(toNum(employee.monthlySalary))} per month`;

  const startDateText = employee.joinDate
    ? formatDate(employee.joinDate)
    : employee.contractStartDate
      ? formatDate(employee.contractStartDate)
      : "a mutually agreed date";

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-2xl bg-white min-h-dvh shadow-sm">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Offer Letter</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{company?.name ?? "Company"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Issued on {formatDate(employee.offerLetterIssuedAt ?? new Date())}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm leading-relaxed text-gray-800">
          <p>
            Dear <strong>{employee.name}</strong>,
          </p>
          <p>
            We are pleased to offer you the position of{" "}
            <strong>{employee.designation ?? "Employee"}</strong>
            {employee.trade ? ` (Trade: ${employee.trade})` : ""} at{" "}
            <strong>{company?.name ?? "the company"}</strong>.
          </p>

          {/* Key terms */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50 w-1/3">Position</td>
                  <td className="px-3 py-2">{employee.designation ?? "—"}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Employment Type</td>
                  <td className="px-3 py-2">{typeLabel}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Compensation</td>
                  <td className="px-3 py-2">{wageText}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Joining Date</td>
                  <td className="px-3 py-2">{startDateText}</td>
                </tr>
                {employee.noticePeriodDays != null && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Notice Period</td>
                    <td className="px-3 py-2">
                      {employee.noticePeriodDays === 0
                        ? "Immediate"
                        : `${employee.noticePeriodDays} days`}
                    </td>
                  </tr>
                )}
                {employee.contractEndDate && (
                  <tr>
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Contract End</td>
                    <td className="px-3 py-2">{formatDate(employee.contractEndDate)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Custom T&Cs (if HR provided them) */}
          {employee.offerLetterTerms && (
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Terms & Conditions</h3>
              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{employee.offerLetterTerms}</p>
              </div>
            </div>
          )}

          <p>
            This offer is valid for acceptance for 7 days from the date of issue. Your joining
            will be subject to satisfactory background verification and medical fitness (if applicable).
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
                Offer Accepted
              </div>
              {employee.offerLetterAcceptedAt && (
                <p className="text-xs text-gray-500">
                  Accepted on {formatDate(employee.offerLetterAcceptedAt)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                By tapping &quot;Accept Offer&quot; below, you confirm that you have read,
                understood, and agree to the terms of this offer.
              </p>
              <AcceptButton employeeId={employee.id} token={token} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
