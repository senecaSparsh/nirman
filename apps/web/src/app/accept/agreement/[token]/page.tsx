import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AcceptButton } from "./AcceptButton";

/**
 * Public agreement acceptance page — accessible via shareable link.
 * URL: /accept/agreement/[token]
 *
 * No auth required — the token IS the auth.
 */
export default async function AcceptAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;

  const employee = await prisma.employee.findFirst({
    where: { contractToken: token, deletedAt: null },
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
      contractStatus: true,
      contractIssuedAt: true,
      contractConfirmedAt: true,
      contractTerms: true,
      companyId: true,
    },
  });

  if (!employee) notFound();

  const company = await prisma.company.findFirst({
    where: { id: employee.companyId },
    select: { name: true, address: true, phone: true, email: true },
  });

  const alreadyAccepted = employee.contractStatus === "CONFIRMED";
  const issued = ["ISSUED", "CONFIRMED"].includes(employee.contractStatus ?? "");

  if (!issued) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-gray-50">
        <div className="max-w-md text-center space-y-2">
          <p className="text-lg font-bold text-gray-900">Agreement not yet issued</p>
          <p className="text-sm text-gray-500">
            The employment agreement has not been issued yet. Please contact your HR representative.
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

  const noticeText = employee.noticePeriodDays != null
    ? employee.noticePeriodDays === 0
      ? "immediate termination (no notice period)"
      : `${employee.noticePeriodDays} days written notice from either party`
    : "30 days written notice from either party (default)";

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-2xl bg-white min-h-dvh shadow-sm">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Employment Agreement</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{company?.name ?? "Company"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Issued on {formatDate(employee.contractIssuedAt ?? new Date())}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm leading-relaxed text-gray-800">
          <p>
            This Employment Agreement is made between{" "}
            <strong>{company?.name ?? "the company"}</strong> (the &quot;Employer&quot;) and{" "}
            <strong>{employee.name}</strong> (the &quot;Employee&quot;).
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
                {employee.contractStartDate && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Start Date</td>
                    <td className="px-3 py-2">{formatDate(employee.contractStartDate)}</td>
                  </tr>
                )}
                {employee.contractEndDate && (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">End Date</td>
                    <td className="px-3 py-2">{formatDate(employee.contractEndDate)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Notice Period</td>
                  <td className="px-3 py-2">{noticeText}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Custom T&Cs (if HR provided them) */}
          {employee.contractTerms && (
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Terms & Conditions</h3>
              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{employee.contractTerms}</p>
              </div>
            </div>
          )}

          <p>
            By accepting this agreement, you acknowledge that you have read, understood, and agree
            to all the terms and conditions herein. You confirm that all information provided to
            the Employer is accurate and complete.
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
              {employee.contractConfirmedAt && (
                <p className="text-xs text-gray-500">
                  Accepted on {formatDate(employee.contractConfirmedAt)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                By tapping &quot;Accept Agreement&quot; below, you confirm that you have read,
                understood, and agree to the terms of this agreement.
              </p>
              <AcceptButton employeeId={employee.id} token={token} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
